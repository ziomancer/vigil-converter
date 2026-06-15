#!/usr/bin/env bun
import { defineCommand, runMain } from "citty"
import packageJson from "../package.json"
import convert from "./commands/convert"
import cleanup from "./commands/cleanup"

const main = defineCommand({
  meta: {
    name: "vigil-converter",
    version: packageJson.version,
    description: "Convert Claude Code skills/plugins into other agent harness formats",
  },
  subCommands: {
    cleanup: () => cleanup,
    convert: () => convert,
  },
})

runMain(main)
