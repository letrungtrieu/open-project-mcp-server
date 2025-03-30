import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import dotenv from 'dotenv';
// Load environment variables from .env file
dotenv.config();
// Configuration for OpenProject API
const config = {
    apiBaseUrl: process.env.OPENPROJECT_API_URL || "https://project.mywelly.vn/api/v3",
    apiKey: process.env.OPENPROJECT_API_KEY || ""
};
// Log configuration for debugging
console.log("OpenProject API Configuration:");
console.log(`API Base URL: ${config.apiBaseUrl}`);
console.log(`API Key: ${config.apiKey ? `${config.apiKey.substr(0, 3)}...${config.apiKey.substr(-3)}` : "[Not Set]"}`);
// Create an MCP server
const server = new McpServer({
    name: "OpenProject MCP Server",
    version: "1.0.0"
});
// Helper function to make authenticated requests to OpenProject API
async function callOpenProjectAPI(endpoint, method = "GET", body) {
    const url = `${config.apiBaseUrl}${endpoint}`;
    console.log(`Making ${method} request to: ${url}`);
    const headers = {
        "Authorization": `Basic ${Buffer.from(`apikey:${config.apiKey}`).toString('base64')}`,
        "Content-Type": "application/json"
    };
    console.log("Request headers:", Object.keys(headers).map(key => `${key}: ${key === 'Authorization' ? 'Basic ***' : headers[key]}`));
    const options = {
        method,
        headers
    };
    if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
        options.body = JSON.stringify(body);
        console.log("Request body:", JSON.stringify(body, null, 2));
    }
    try {
        console.log("Sending request...");
        const response = await fetch(url, options);
        console.log(`Response status: ${response.status} ${response.statusText}`);
        if (!response.ok) {
            const responseText = await response.text();
            let errorMessage;
            try {
                const errorData = JSON.parse(responseText);
                console.error("Error response:", JSON.stringify(errorData, null, 2));
                errorMessage = errorData.message || "Unknown error";
            }
            catch (e) {
                console.error("Raw error response:", responseText);
                errorMessage = responseText || "Unknown error";
            }
            throw new Error(`OpenProject API error (${response.status}): ${errorMessage}`);
        }
        const responseData = await response.json();
        console.log("Response data:", JSON.stringify(responseData, null, 2).substring(0, 500) + "...");
        return responseData;
    }
    catch (error) {
        console.error("Error calling OpenProject API:", error);
        throw error;
    }
}
// Format a work package into a human-readable structure
function formatWorkPackage(workPackage) {
    return {
        id: workPackage.id,
        subject: workPackage.subject,
        description: workPackage._embedded?.description?.raw || "No description",
        status: workPackage._embedded?.status?.name || "Unknown status",
        type: workPackage._embedded?.type?.name || "Unknown type",
        priority: workPackage._embedded?.priority?.name || "Unknown priority",
        assignee: workPackage._embedded?.assignee?.name || "Unassigned",
        project: workPackage._embedded?.project?.name || "Unknown project",
        createdAt: workPackage.createdAt,
        updatedAt: workPackage.updatedAt,
        startDate: workPackage.startDate || "No start date",
        dueDate: workPackage.dueDate || "No due date",
        estimatedTime: workPackage.estimatedTime || "No estimate",
        percentageDone: workPackage.percentageDone || 0,
        lockVersion: workPackage.lockVersion
    };
}
// Tool 1: Get Work Package Detail
server.tool("get-work-package-detail", {
    workPackageId: z.number().describe("ID of the work package to retrieve")
}, async ({ workPackageId }) => {
    try {
        const data = await callOpenProjectAPI(`/work_packages/${workPackageId}`);
        const formattedResponse = formatWorkPackage(data);
        return {
            content: [{
                    type: "text",
                    text: `Work Package #${workPackageId} Details:\n${JSON.stringify(formattedResponse, null, 2)}`
                }]
        };
    }
    catch (error) {
        const err = error;
        return {
            content: [{
                    type: "text",
                    text: `Error retrieving work package #${workPackageId}: ${err.message}`
                }],
            isError: true
        };
    }
});
// Tool 2: Change Work Package Status
server.tool("change-work-package-status", {
    workPackageId: z.number().describe("ID of the work package to update"),
    status: z.string().describe("New status for the work package")
}, async ({ workPackageId, status }) => {
    try {
        // Get the work package details
        const workPackage = await callOpenProjectAPI(`/work_packages/${workPackageId}`);
        // Get available statuses
        const availableStatuses = await callOpenProjectAPI(`/work_packages/${workPackageId}/available_statuses`);
        // Find the status that matches the requested name (case-insensitive)
        const targetStatus = availableStatuses._embedded.elements.find((s) => s.name.toLowerCase() === status.toLowerCase());
        if (!targetStatus) {
            const availableStatusNames = availableStatuses._embedded.elements
                .map((s) => s.name)
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
        const updatedWorkPackage = await callOpenProjectAPI(`/work_packages/${workPackageId}`, "PATCH", updatePayload);
        const formattedWorkPackage = formatWorkPackage(updatedWorkPackage);
        return {
            content: [{
                    type: "text",
                    text: `Successfully updated work package #${workPackageId} status from "${workPackage._embedded?.status?.name}" to "${targetStatus.name}".\n\nUpdated work package:\n${JSON.stringify(formattedWorkPackage, null, 2)}`
                }]
        };
    }
    catch (error) {
        const err = error;
        return {
            content: [{
                    type: "text",
                    text: `Error updating work package #${workPackageId} status: ${err.message}`
                }],
            isError: true
        };
    }
});
// Start the server with stdio transport
async function startServer() {
    try {
        console.error("Starting OpenProject MCP Server...");
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.log("Started OpenProject MCP Server!");
    }
    catch (error) {
        console.error("Error starting server:", error);
        process.exit(1);
    }
}
startServer();
