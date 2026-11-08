const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: 'test',
  forbidOnly: !!process.env.CI
})
