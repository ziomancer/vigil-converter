#!/usr/bin/env bun
import { defineCommand, runMain } from "citty"
import packageJson from "../package.json"
import convert from "./commands/convert"

const main = defineCommand({
  meta: {
    name: "vigil-converter",
    version: packageJson.version,
    description: "Convert Claude Code skills/plugins into other agent harness formats",
  },
  subCommands: {
    convert: () => convert,
  },
})

runMain(main)
