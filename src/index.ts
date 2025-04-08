#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import dotenv from 'dotenv';
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  WorkPackage,
  AvailableStatusesResponse,
  Status,
  ErrorResponse,
  AttachmentCollectionResponse,
  Attachment
} from "./openproject-api-types.js";

// Parse command line arguments
const { values: args } = parseArgs({
  options: {
    'api-url': { type: 'string' },
    'api-key': { type: 'string' },
    help: { type: 'boolean', short: 'h' }
  }
});

// Show help if requested
if (args.help) {
  console.log(`
OpenProject MCP Server

Usage:
  openproject [options]

Options:
  --api-url <url>     OpenProject API URL (default: from .env OPENPROJECT_API_URL)
  --api-key <key>     OpenProject API Key (default: from .env OPENPROJECT_API_KEY)
  -h, --help          Show this help message
  `);
  process.exit(0);
}

// Load environment variables from .env file
dotenv.config();

// Configuration for OpenProject API - prioritize command line args over env vars
const config = {
  apiBaseUrl: args['api-url'] || process.env.OPENPROJECT_API_URL || "https://project.mywelly.vn",
  apiKey: args['api-key'] || process.env.OPENPROJECT_API_KEY || ""
};

// Validate configuration
if (!config.apiKey) {
  console.error("Error: API key is required. Provide it via --api-key argument or OPENPROJECT_API_KEY environment variable.");
  process.exit(1);
}

// Create an MCP server
const server = new McpServer({
  name: "OpenProject MCP Server",
  version: "1.0.0"
});

// Helper function to make authenticated requests to OpenProject API
async function callOpenProjectAPI<T>(endpoint: string, method: string = "GET", body?: any): Promise<T> {
  const url = `${config.apiBaseUrl}/api/v3${endpoint}`;

  const headers = {
    "Authorization": `Basic ${Buffer.from(`apikey:${config.apiKey}`).toString('base64')}`,
    "Content-Type": "application/json"
  };

  const options: any = {
    method,
    headers
  };

  if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const responseText = await response.text();
      let errorMessage;
      try {
        const errorData = JSON.parse(responseText) as ErrorResponse;
        errorMessage = errorData.message || "Unknown error";
      } catch (e) {
        errorMessage = responseText || "Unknown error";
      }
      throw new Error(`OpenProject API error (${response.status}): ${errorMessage}`);
    }

    const responseData = await response.json() as T;
    return responseData;
  } catch (error) {
    throw error;
  }
}

// Format a work package into a human-readable structure
function formatWorkPackage(workPackage: WorkPackage, statuses: AvailableStatusesResponse) {
  return {
    id: workPackage.id,
    subject: workPackage.subject,
    status: workPackage._embedded?.status?.name || "Unknown status",
    type: workPackage._embedded?.type?.name || "Unknown type",
    priority: workPackage._embedded?.priority?.name || "Unknown priority",
    assignee: workPackage._embedded?.assignee?.name || "Unassigned",
    project: workPackage._embedded?.project?.name || "Unknown project",
    projectId: workPackage._embedded?.project?.id || 0,
    description: workPackage.description?.raw || "No description",
    createdAt: workPackage.createdAt,
    updatedAt: workPackage.updatedAt,
    startDate: workPackage.startDate || "No start date",
    dueDate: workPackage.dueDate || "No due date",
    estimatedTime: workPackage.estimatedTime || "No estimate",
    percentageDone: workPackage.percentageDone || 0,
    lockVersion: workPackage.lockVersion,
    statuses: statuses._embedded.elements.map(e => e.name)
  };
}

// Tool 1: Get Work Package Detail
server.tool(
  "get_work_package_detail",
  "Get the details of a OpenProject work package",
  {
    workPackageId: z.number().describe("ID of the work package to retrieve")
  },
  async ({ workPackageId }) => {
    try {
      const data = await callOpenProjectAPI<WorkPackage>(`/work_packages/${workPackageId}`);
      const statuses = await callOpenProjectAPI<AvailableStatusesResponse>(`/statuses`)
      const formattedResponse = formatWorkPackage(data, statuses);
      return {
        content: [{
          type: "text",
          text: `Work Package #${workPackageId} Details:\n${JSON.stringify(formattedResponse, null, 2)}`
        }]
      };
    } catch (error) {
      const err = error as Error;
      return {
        content: [{
          type: "text",
          text: `Error retrieving work package #${workPackageId}: ${err.message}`
        }],
        isError: true
      };
    }
  }
);

// Tool 2: Change Work Package Status
server.tool(
  "change_work_package_status",
  "Change the status of a OpenProject work package",
  {
    workPackageId: z.number().describe("ID of the work package to update"),
    status: z.string().describe("New status for the work package")
  },
  async ({ workPackageId, status }) => {
    try {
      // Get the work package details
      const workPackage = await callOpenProjectAPI<WorkPackage>(`/work_packages/${workPackageId}`);

      // Get available statuses
      const statuses = await callOpenProjectAPI<AvailableStatusesResponse>(`/statuses`)

      // Find the status that matches the requested name (case-insensitive)
      const targetStatus = statuses._embedded.elements.find(
        (s: Status) => s.name.toLowerCase() === status.toLowerCase()
      );

      if (!targetStatus) {
        const availableStatusNames = statuses._embedded.elements
          .map((s: Status) => s.name)
          .join(", ");

        return {
          content: [{
            type: "text",
            text: `Error: Status "${status}" is not available for work package #${workPackageId}. Available statuses are: ${availableStatusNames}`
          }],
          isError: true
        };
      }

      // Update the work package status
      const updatePayload = {
        lockVersion: workPackage.lockVersion,
        _links: {
          status: {
            href: targetStatus._links.self.href
          }
        }
      };

      const updatedWorkPackage = await callOpenProjectAPI<WorkPackage>(
        `/work_packages/${workPackageId}`,
        "PATCH",
        updatePayload
      );

      const formattedWorkPackage = formatWorkPackage(updatedWorkPackage, statuses);

      return {
        content: [{
          type: "text",
          text: `Successfully updated work package #${workPackageId} status from "${workPackage._embedded?.status?.name}" to "${targetStatus.name}".\n\nUpdated work package:\n${JSON.stringify(formattedWorkPackage, null, 2)}`
        }]
      };
    } catch (error) {
      const err = error as Error;
      return {
        content: [{
          type: "text",
          text: `Error updating work package #${workPackageId} status: ${err.message}`
        }],
        isError: true
      };
    }
  }
);



// Helper function to download a file from a URL and save it to a path
async function downloadFile(endpoint: string, filePath: string): Promise<void> {
  const url = `${config.apiBaseUrl}${endpoint}`;

  const headers = {
    "Authorization": `Basic ${Buffer.from(`apikey:${config.apiKey}`).toString('base64')}`,
    "Content-Type": "application/json"
  };

  const options: any = {
    method: "GET",
    headers
  };
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  const fileStream = fs.createWriteStream(filePath);
  await new Promise<void>((resolve, reject) => {
    response.body?.pipe(fileStream);
    response.body?.on('error', (err) => {
      reject(err);
    });
    fileStream.on('finish', function() {
      resolve();
    });
  });
}

// Tool 3: Download all attachments of work package
server.tool(
  "download_work_package_attachments",
  "Download all attachments from a work package to a temporary folder",
  {
    workPackageId: z.number().describe("ID of the work package containing the attachments"),
  },
  async ({ workPackageId }) => {
    try {
      // Get the attachments for the work package
      const attachments = await callOpenProjectAPI<AttachmentCollectionResponse>(`/work_packages/${workPackageId}/attachments`);

      // If no attachments found
      if (attachments.total === 0) {
        return {
          content: [{
            type: "text",
            text: `No attachments found for work package #${workPackageId}.`
          }],
          isError: false
        };
      }

      // Create a temporary directory for this work package
      const tempDir = path.join(os.tmpdir(), `openproject/${workPackageId}`);

      // Ensure the directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Download all attachments
      const downloadResults = [];
      const downloadedFiles = [];

      // Download each attachment
      for (const attachment of attachments._embedded.elements) {
        const downloadUrl = attachment._links.staticDownloadLocation.href;

        if (!downloadUrl) {
          downloadResults.push(`⚠️ Skipped ${attachment.fileName} (ID: ${attachment.id}): Download URL not available`);
          continue;
        }

        try {
          const filePath = path.join(tempDir, `${attachment.id}.${attachment.fileName}`);
          await downloadFile(downloadUrl, filePath);
          downloadResults.push(`✅ Downloaded ${attachment.fileName} (ID: ${attachment.id})`);
          downloadedFiles.push({
            id: attachment.id,
            fileName: attachment.fileName,
            filePath: filePath,
            fileSize: attachment.fileSize,
            contentType: attachment.contentType
          });
        } catch (error) {
          const err = error as Error;
          downloadResults.push(`❌ Failed to download ${attachment.fileName} (ID: ${attachment.id}): ${err.message}`);
        }
      }

      // Create a mapping of file names to their paths
      const fileMapping = downloadedFiles.map(file => {
        return {
          id: file.id,
          filePath: file.filePath,
          contentType: file.contentType
        };
      });

      return {
        content: [{
          type: "text",
          text: `Download results for work package #${workPackageId}:\n${downloadResults.join('\n')}\n\nFiles saved to: ${tempDir}\n\nFile mapping:\n${JSON.stringify(fileMapping, null, 2)}`
        }]
      };
    } catch (error) {
      const err = error as Error;
      return {
        content: [{
          type: "text",
          text: `Error processing attachments for work package #${workPackageId}: ${err.message}`
        }],
        isError: true
      };
    }
  }
);

// Start the server with stdio transport
async function startServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

startServer();
