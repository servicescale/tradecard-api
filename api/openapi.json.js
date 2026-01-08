// api/openapi.json.js
// Serves the OpenAPI 3.1.0 schema for your scraping/crawling/build service.

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "TradeCard Site Processor",
    version: "1.0.0",
    description:
      "Deterministic site scraping, crawling, and TradeCard JSON builder. Returns structured data suitable for downstream processing."
  },
  servers: [
    {
      url: "https://tradecard-api.vercel.app"
    }
  ],
  // If you want to lock this behind an API key later, uncomment security + components.securitySchemes
  // security: [{ ApiKeyAuth: [] }],
  paths: {
    "/api": {
      get: {
        operationId: "healthCheck",
        summary: "Health check and list available endpoints",
        responses: {
          "200": {
            description: "API status and available endpoints"
          }
        }
      }
    },
    "/api/scrape": {
      get: {
        operationId: "scrapePage",
        summary: "Scrape a single page",
        description: "Fetches one page and returns title, headings (h1–h6), images (including CSS backgrounds), absolute links, plus socials and contacts derived from links.",
        parameters: [
          { name: "url", in: "query", required: true, schema: { type: "string", format: "uri" }, description: "Absolute http(s) URL to scrape" },
          { name: "limitImages", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500 }, description: "Cap number of images returned" },
          { name: "cssMaxFiles", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 20 }, description: "Max external stylesheets to fetch" },
          { name: "cssMaxDepth", in: "query", required: false, schema: { type: "integer", minimum: 0, maximum: 3, default: 2 }, description: "Max @import nesting depth" }
        ],
        responses: {
          "200": {
            description: "Scrape result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ScrapeResponse" }
              }
            }
          },
          "400": { description: "Bad request" },
          "502": { description: "Upstream/site fetch failed" }
        }
      }
    },
    "/api/crawl": {
      get: {
        operationId: "crawlSite",
        summary: "Crawl a site (same-origin)",
        description: "Breadth-first traversal from the start URL, same-origin by default. Aggregates page data (including language) but does not build a TradeCard.",
        parameters: [
          { name: "url", in: "query", required: true, schema: { type: "string", format: "uri" } },
          { name: "maxPages", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 10 } },
          { name: "maxDepth", in: "query", required: false, schema: { type: "integer", minimum: 0, maximum: 5, default: 2 } },
          { name: "sameOrigin", in: "query", required: false, schema: { type: "integer", enum: [0,1], default: 1 }, description: "1 = restrict to same origin; 0 = allow externals" },
          { name: "includeSitemap", in: "query", required: false, schema: { type: "integer", enum: [0,1], default: 1 }, description: "When 1, seed the crawl with URLs from /sitemap.xml (same-origin only)" }
        ],
        responses: {
          "200": {
            description: "Crawl result",
            content: { "application/json": { schema: { $ref: "#/components/schemas/CrawlResponse" } } }
          },
          "400": { description: "Bad request" }
        }
      }
    },
    "/api/build": {
      get: {
        operationId: "buildTradeCard",
        summary: "Build a TradeCard JSON from a site",
        description: "Calls the deterministic crawler and normalizes into a TradeCard-ready JSON.",
        parameters: [
          { name: "url", in: "query", required: true, schema: { type: "string", format: "uri" } },
          { name: "maxPages", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 12 } },
          { name: "maxDepth", in: "query", required: false, schema: { type: "integer", minimum: 0, maximum: 5, default: 2 } },
          { name: "sameOrigin", in: "query", required: false, schema: { type: "integer", enum: [0,1], default: 1 } },
          { name: "includeSitemap", in: "query", required: false, schema: { type: "integer", enum: [0,1], default: 1 }, description: "When 1, seed the crawl with URLs from /sitemap.xml (same-origin only)" },
          { name: "save", in: "query", required: false, schema: { type: "integer", enum: [0,1], default: 1 }, description: "If BOSTONOS_API_TOKEN is set, save to BostonOS when save=1" },
          { name: "push", in: "query", required: false, schema: { type: "integer", enum: [0,1], default: 0 }, description: "When 1 and WP_BASE/WP_BEARER are set, push TradeCard to WordPress" },
          { name: "debug", in: "query", required: false, schema: { type: "integer", enum: [0,1], default: 0 }, description: "When 1, include debug.trace with stage timings" }
        ],
        responses: {
          "200": {
            description: "TradeCard result",
            content: { "application/json": { schema: { $ref: "#/components/schemas/BuildCardResponse" } } }
          },
          "400": { description: "Bad request" },
          "500": { description: "Internal error" }
        }
      }
    },
    "/api/structure": {
      get: {
        operationId: "buildStructure",
        summary: "Build a structured site representation",
        description: "Crawls the site and returns per-page structure plus overview metrics for downstream assessment.",
        parameters: [
          { name: "url", in: "query", required: true, schema: { type: "string", format: "uri" } },
          { name: "maxPages", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 12 } },
          { name: "maxDepth", in: "query", required: false, schema: { type: "integer", minimum: 0, maximum: 5, default: 2 } },
          { name: "sameOrigin", in: "query", required: false, schema: { type: "integer", enum: [0,1], default: 1 } },
          { name: "includeSitemap", in: "query", required: false, schema: { type: "integer", enum: [0,1], default: 1 }, description: "When 1, seed the crawl with URLs from /sitemap.xml (same-origin only)" }
        ],
        responses: {
          "200": {
            description: "Structured site representation",
            content: { "application/json": { schema: { $ref: "#/components/schemas/StructureResponse" } } }
          },
          "400": { description: "Bad request" },
          "500": { description: "Internal error" }
        }
      }
    }
  },
  components: {
    // securitySchemes: {
    //   ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" }
    // },
    schemas: {
      Heading: {
        type: "object",
        properties: {
          level: { type: "string", enum: ["h1","h2","h3","h4","h5","h6"] },
          text: { type: "string" },
          url:  { type: "string", format: "uri" }
        },
        required: ["level","text","url"]
      },
      SocialLink: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["facebook","instagram","twitter","linkedin","youtube","tiktok"] },
          url: { type: "string", format: "uri" }
        },
        required: ["platform","url"]
      },
      Contacts: {
        type: "object",
        properties: {
          emails: { type: "array", items: { type: "string", format: "email" } },
          phones: { type: "array", items: { type: "string" } }
        }
      },
      Image: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
          alt: { type: "string", nullable: true }
        },
        required: ["url"]
      },
      Page: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
          title: { type: "string", nullable: true },
          page_language: { type: "string", nullable: true },
          headings: {
            type: "object",
            properties: {
              h1: { type: "array", items: { type: "string" } },
              h2: { type: "array", items: { type: "string" } },
              h3: { type: "array", items: { type: "string" } },
              h4: { type: "array", items: { type: "string" } },
              h5: { type: "array", items: { type: "string" } },
              h6: { type: "array", items: { type: "string" } }
            }
          },
          images: { type: "array", items: { $ref: "#/components/schemas/Image" } },
          links:  { type: "array", items: { type: "string", format: "uri" } },
          social: { type: "array", items: { $ref: "#/components/schemas/SocialLink" } },
          contacts: { $ref: "#/components/schemas/Contacts" }
        },
        required: ["url"]
      },
      ScrapeResponse: {
        type: "object",
        properties: { page: { $ref: "#/components/schemas/Page" } },
        required: ["page"]
      },
      CrawlResponse: {
        type: "object",
        properties: {
          site:  { type: "string", format: "uri" },
          pages: { type: "array", items: { $ref: "#/components/schemas/Page" } },
          stats: {
            type: "object",
            properties: {
              visited: { type: "integer" },
              returned: { type: "integer" },
              maxPages: { type: "integer" },
              maxDepth: { type: "integer" },
              sameOriginOnly: { type: "boolean" },
              includeSitemap: { type: "boolean" }
            }
          },
          errors: { type: "array", items: { type: "string" } }
        },
        required: ["site","pages","stats"]
      },
      TradeCard: {
        type: "object",
        properties: {
          business: {
            type: "object",
            properties: {
              name: { type: "string" },
              abn: { type: "string", nullable: true },
              description: { type: "string", nullable: true }
            },
            required: ["name"]
          },
          contacts: { $ref: "#/components/schemas/Contacts" },
          social: { type: "array", items: { $ref: "#/components/schemas/SocialLink" } },
          assets: {
            type: "object",
            properties: {
              logo: { type: "string", format: "uri", nullable: true },
              hero: { type: "string", format: "uri", nullable: true },
              images: { type: "array", items: { type: "string", format: "uri" } }
            }
          },
          content: {
            type: "object",
            properties: { headings: { type: "array", items: { $ref: "#/components/schemas/Heading" } } }
          },
          services: {
            type: "object",
            properties: { list: { type: "array", items: { type: "string" }, nullable: true } }
          },
          service_areas: { type: "array", items: { type: "string" }, nullable: true },
          brand: {
            type: "object",
            properties: {
              tone: { type: "string", nullable: true },
              colors: { type: "array", items: { type: "string" }, nullable: true }
            }
          },
          testimonials: { type: "array", items: { type: "string" }, nullable: true }
        },
        required: ["business","contacts","social","assets","content","services","brand"]
      },
      BuildCardResponse: {
        type: "object",
        properties: {
          site: {
            type: "object",
            properties: {
              url: { type: "string", format: "uri" },
              domain: { type: "string" },
              crawled_at: { type: "string", format: "date-time" },
              pages_count: { type: "integer" }
            }
          },
          tradecard: { $ref: "#/components/schemas/TradeCard" },
          provenance: {
            type: "object",
            properties: {
              start_url: { type: "string", format: "uri" },
              pages: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    url: { type: "string", format: "uri" },
                    title: { type: "string", nullable: true },
                    images: { type: "integer" }
                  }
                }
              },
              extraction: { type: "object" }
            }
          },
          needs_inference: { type: "array", items: { type: "string" } },
          persisted: {
            type: "object",
            nullable: true,
            additionalProperties: true
          },
          wordpress: {
            type: "object",
            nullable: true,
            additionalProperties: true
          },
          debug: {
            type: "object",
            nullable: true,
            additionalProperties: true
          }
        },
        required: ["site","tradecard","provenance","needs_inference"]
      },
      HeadingCounts: {
        type: "object",
        properties: {
          h1: { type: "integer" },
          h2: { type: "integer" },
          h3: { type: "integer" },
          h4: { type: "integer" },
          h5: { type: "integer" },
          h6: { type: "integer" }
        }
      },
      LinkCounts: {
        type: "object",
        properties: {
          internal: { type: "integer" },
          external: { type: "integer" },
          mailto: { type: "integer" },
          tel: { type: "integer" },
          sms: { type: "integer" },
          whatsapp: { type: "integer" }
        }
      },
      CtaLink: {
        type: "object",
        properties: {
          label: { type: "string", nullable: true },
          title: { type: "string", nullable: true },
          href: { type: "string", format: "uri", nullable: true }
        }
      },
      StructuredPage: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
          title: { type: "string", nullable: true },
          page_language: { type: "string", nullable: true },
          meta_description: { type: "string", nullable: true },
          headings: { type: "object" },
          heading_counts: { $ref: "#/components/schemas/HeadingCounts" },
          word_count: { type: "integer" },
          character_count: { type: "integer" },
          text_blocks: { type: "array", items: { type: "string" } },
          layout_blocks: { type: "array", items: { $ref: "#/components/schemas/LayoutBlock" } },
          images: { type: "array", items: { $ref: "#/components/schemas/Image" } },
          image_count: { type: "integer" },
          first_image_url: { type: "string", format: "uri", nullable: true },
          link_counts: { $ref: "#/components/schemas/LinkCounts" },
          ctas: {
            type: "object",
            properties: {
              anchors: { type: "array", items: { $ref: "#/components/schemas/CtaLink" } },
              service_panels: { type: "array", items: { $ref: "#/components/schemas/CtaLink" } },
              projects: { type: "array", items: { $ref: "#/components/schemas/CtaLink" } },
              contact_forms: { type: "array", items: { type: "string", format: "uri" } },
              total: { type: "integer" }
            }
          },
          social: { type: "array", items: { $ref: "#/components/schemas/SocialLink" } },
          contacts: { $ref: "#/components/schemas/Contacts" }
        },
        required: ["url"]
      },
      LayoutBlock: {
        type: "object",
        properties: {
          order: { type: "integer" },
          tag: { type: "string" },
          selector: { type: "string", nullable: true },
          role: { type: "string", nullable: true },
          aria_label: { type: "string", nullable: true },
          text_sample: { type: "string", nullable: true },
          headings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                level: { type: "string" },
                text: { type: "string" }
              }
            }
          },
          image_count: { type: "integer" },
          images: { type: "array", items: { type: "string", format: "uri" } },
          link_count: { type: "integer" },
          links: { type: "array", items: { type: "string", format: "uri" } },
          paragraph_count: { type: "integer" },
          list_count: { type: "integer" },
          form_count: { type: "integer" },
          button_count: { type: "integer" }
        }
      },
      StructureOverview: {
        type: "object",
        properties: {
          pages_count: { type: "integer" },
          totals: { type: "object" },
          averages: { type: "object" },
          languages: { type: "array", items: { type: "string" } }
        }
      },
      StructureResponse: {
        type: "object",
        properties: {
          site: {
            type: "object",
            properties: {
              url: { type: "string", format: "uri" },
              domain: { type: "string", nullable: true },
              crawled_at: { type: "string", format: "date-time" },
              pages_count: { type: "integer" }
            }
          },
          overview: { $ref: "#/components/schemas/StructureOverview" },
          pages: { type: "array", items: { $ref: "#/components/schemas/StructuredPage" } }
        },
        required: ["site","overview","pages"]
      }
    }
  }
};

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).end(JSON.stringify(SPEC, null, 2));
};
