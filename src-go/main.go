package main

import (
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"

	mcp_golang "github.com/metoro-io/mcp-golang"
	"github.com/metoro-io/mcp-golang/transport/stdio"
)

// Add arguments struct for the curl tool
// No arguments needed for this specific endpoint, but struct is required by framework
// You can extend this to accept URL, headers, etc. if needed
type CurlToolArguments struct {
	WorkPackageID int `json:"work_package_id" jsonschema:"required,description=Work Package ID of OpenProject"`
}

type WorkPackageResponse struct {
	ID          int    `json:"id"`
	Subject     string `json:"subject"`
	Description struct {
		Raw string `json:"raw"`
	} `json:"description"`
	Links struct {
		Status struct {
			Title string `json:"title"`
		} `json:"status"`
		Assignee struct {
			Title string `json:"title"`
		} `json:"assignee"`
	} `json:"_links"`
	Embedded struct {
		Attachments struct {
			Embedded struct {
				Elements []struct {
					Links struct {
						DownloadLocation struct {
							Href string `json:"href"`
						} `json:"downloadLocation"`
					} `json:"_links"`
				} `json:"elements"`
			} `json:"_embedded"`
		} `json:"attachments"`
		Activities struct {
			Embedded struct {
				Elements []struct {
					Comment struct {
						Raw string `json:"raw"`
					} `json:"comment"`
				} `json:"elements"`
			} `json:"_embedded"`
		} `json:"activities"`
	} `json:"_embedded"`
}

func main() {
	done := make(chan struct{})

	apiKey := ""
	flag.StringVar(&apiKey, "apikey", "", "OpenProject API key")
	flag.Parse()
	if apiKey == "" {
		apiKey = os.Getenv("OPENPROJECT_API_KEY")
	}
	if apiKey == "" {
		panic("API key must be provided via --apikey or OPENPROJECT_API_KEY env var")
	}
	// b64 encode "apikey:${apiKey}"
	basicAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("apikey:"+apiKey))

	server := mcp_golang.NewServer(stdio.NewStdioServerTransport())

	// Register the curl tool
	err := server.RegisterTool("get_detail_work_package_by_id", "Get work package from OpenProject API by ID", func(arguments CurlToolArguments) (*mcp_golang.ToolResponse, error) {
		client := &http.Client{}
		url := fmt.Sprintf("https://project.mywelly.vn/api/v3/work_packages/%d", arguments.WorkPackageID)
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/hal+json")
		req.Header.Set("Authorization", basicAuth)
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, err
		}

		var wpResp WorkPackageResponse
		err = json.Unmarshal(body, &wpResp)
		if err != nil {
			return nil, err
		}

		type MinimalWorkPackage struct {
			ID          int    `json:"id"`
			Subject     string `json:"subject"`
			Status      string `json:"status"`
			Assignee    string `json:"assignee"`
			Description string `json:"description"`
			Evidence    string `json:"evidence,omitempty"`
			Comment     string `json:"comment,omitempty"`
		}

		wp := MinimalWorkPackage{
			ID:          wpResp.ID,
			Subject:     wpResp.Subject,
			Status:      wpResp.Links.Status.Title,
			Assignee:    wpResp.Links.Assignee.Title,
			Description: wpResp.Description.Raw,
		}
		// Lấy evidence (ảnh đầu tiên nếu có)
		if len(wpResp.Embedded.Attachments.Embedded.Elements) > 0 {
			first := wpResp.Embedded.Attachments.Embedded.Elements[0]
			wp.Evidence = first.Links.DownloadLocation.Href
		}
		// Lấy comment đầu tiên nếu có
		if len(wpResp.Embedded.Activities.Embedded.Elements) > 0 {
			firstComment := wpResp.Embedded.Activities.Embedded.Elements[0].Comment.Raw
			if firstComment != "" {
				wp.Comment = firstComment
			}
		}

		result, err := json.Marshal(wp)
		if err != nil {
			return nil, err
		}
		return mcp_golang.NewToolResponse(mcp_golang.NewTextContent(string(result))), nil
	})
	if err != nil {
		panic(err)
	}

	err = server.Serve()
	if err != nil {
		panic(err)
	}

	<-done
}
