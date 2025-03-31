#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import dotenv from 'dotenv';
import type {
  WorkPackage,
  AvailableStatusesResponse,
  Status,
  ErrorResponse
} from "./openproject-api-types.js";

// Load environment variables from .env file
dotenv.config();

// Configuration for OpenProject API
const config = {
  apiBaseUrl: process.env.OPENPROJECT_API_URL || "https://project.mywelly.vn/api/v3",
  apiKey: process.env.OPENPROJECT_API_KEY || ""
};

// Create an MCP server
const server = new McpServer({
  name: "OpenProject MCP Server",
  version: "1.0.0"
});

// Helper function to make authenticated requests to OpenProject API
async function callOpenProjectAPI<T>(endpoint: string, method: string = "GET", body?: any): Promise<T> {
  const url = `${config.apiBaseUrl}${endpoint}`;
  
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