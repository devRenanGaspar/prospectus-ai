import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/test/**",
        "src/integrations/supabase/types.ts",
      ],
      thresholds: {
        // `branches` and `functions` have no threshold, on purpose. The v8
        // provider assigns exactly 1 function and 1 branch to every file it
        // has no execution data for, and most of this project's files are in
        // that state -- so most of the denominator is placeholders, not
        // code. The percentage does not measure coverage, and it moves the
        // wrong way as tests are added: covering a file swaps its single
        // placeholder branch for its real ones, which can push the ratio
        // down even as real coverage goes up. A gate that punishes new tests
        // is worse than no gate.
        //
        // statements/lines do not have this problem -- v8 counts the real
        // statements of a file it never ran -- so they are the two kept as
        // an enforced floor. The HTML and text reports still print all four
        // numbers; only these two gate CI. Never lower these to make CI
        // pass; raise them when real coverage grows past the current floor.
        statements: 11,
        lines: 11,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
