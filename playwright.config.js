const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: 'test',
  fullyParallel: true, // every test launches its own app with its own notes and settings
  forbidOnly: !!process.env.CI
})
