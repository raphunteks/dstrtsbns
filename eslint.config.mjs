import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  { ignores: [".next/**", "node_modules/**", "supabase/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      // Rahasia hanya boleh dibaca lewat src/server/env.ts (SEC-006).
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Gunakan env dari '@/server/env' (server) atau publicEnv dari '@/lib/public-env' (client).",
        },
      ],
    },
  },
  {
    files: [
      "src/server/env.ts",
      "src/lib/public-env.ts",
      "src/server/db/client.ts",
      "next.config.ts",
      "prisma/**",
      "vitest.config.ts",
    ],
    rules: { "no-restricted-properties": "off" },
  },
];

export default config;
