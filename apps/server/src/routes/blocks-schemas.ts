import { Router } from "express";
import { linkConfigSchema, mediaConfigSchema } from "@ampedbio/constants";

const blocksSchemasRouter: Router = Router();

blocksSchemasRouter.get("/", (req, res) => {
  const blockSchemas = [
    {
      type: "link",
      schema: {
        platform: {
          type: "enum",
          values: linkConfigSchema.shape.platform._def.values,
        },
        url: {
          type: "string",
          format: "url",
          description: "Must be a valid URL",
        },
        label: {
          type: "string",
          minLength: 1,
          description: "Label is required",
        },
      },
    },
    {
      type: "media",
      schema: {
        platform: {
          type: "enum",
          values: mediaConfigSchema.shape.platform._def.values,
        },
        url: {
          type: "string",
          format: "url",
          description: "Must be a valid URL",
        },
        label: {
          type: "string",
        },
        content: {
          type: "string",
          optional: true,
        },
      },
    },
    {
      type: "text",
      schema: {
        content: {
          type: "string",
          minLength: 0,
          description: "Content is required",
        },
        platform: {
          type: "string",
        },
      },
    },
    {
      type: "pool",
      schema: {
        address: {
          type: "string",
          pattern: "^0x[a-fA-F0-9]+$",
          description: "Must be a valid blockchain address starting with 0x",
        },
        label: {
          type: "string",
          minLength: 1,
          description: "Label is required",
        },
      },
    },
    {
      type: "referral",
      schema: {},
    },
  ];

  res.json(blockSchemas);
});

export default blocksSchemasRouter;
