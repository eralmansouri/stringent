// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import react from "@astrojs/react";
import ecTwoSlash from "expressive-code-twoslash";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";
import ts from "typescript";

export default defineConfig({
  site: "https://eralmansouri.github.io",
  base: "/stringent",
  integrations: [
    starlight({
      title: "Stringent",
      description:
        "A type-safe expression parser and evaluator for TypeScript. One grammar definition drives a compile-time type-level parser and a runtime parser with structured errors.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/eralmansouri/stringent",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/eralmansouri/stringent/edit/main/docs/",
      },
      expressiveCode: {
        plugins: [
          ecTwoSlash({
            twoslashOptions: {
              compilerOptions: {
                strict: true,
                target: ts.ScriptTarget.ESNext,
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.Bundler,
              },
            },
          }),
        ],
      },
      plugins: [
        starlightTypeDoc({
          entryPoints: ["../src/index.ts"],
          tsconfig: "../tsconfig.json",
          typeDoc: {
            excludeInternal: true,
            sort: ["source-order"],
            entryFileName: "index",
          },
        }),
      ],
      sidebar: [
        {
          label: "Guides",
          items: [
            "guides/getting-started",
            "guides/defining-a-grammar",
            "guides/schemas-and-types",
            "guides/parsing-and-evaluation",
            "guides/error-handling",
          ],
        },
        {
          label: "Explanation",
          items: ["explanation/architecture"],
        },
        {
          label: "Try it",
          items: ["playground"],
        },
        typeDocSidebarGroup,
      ],
    }),
    react(),
  ],
});
