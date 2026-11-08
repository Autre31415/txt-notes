// this file uses electron-builder to create executables for various operating systems
// usage is defined in the package.json run scripts
const { build, Platform, Arch } = require('electron-builder')

const platforms = {
  linux: Platform.LINUX,
  mac: Platform.MAC,
  win: Platform.WINDOWS
}

async function buildAll () {
  const buildTarget = process.argv[2]
  const builds = []

  if (buildTarget === 'self') {
    // quick build; only one kind of packaging for this computer's OS and architecture so it builds faster (useful for testing purposes)
    const [platform, type] = {
      linux: [Platform.LINUX, 'AppImage'],
      darwin: [Platform.MAC, 'zip'],
      win32: [Platform.WINDOWS, 'zip']
    }[process.platform]

    builds.push(['self', platform.createTarget(type, Arch[process.arch])])
  } else if (!buildTarget || platforms[buildTarget]) {
    // full builds; all types of packaging for the given OS, or for every OS when none is given
    for (const [name, platform] of Object.entries(platforms)) {
      if (!buildTarget || buildTarget === name) {
        builds.push([name, platform.createTarget()])
      }
    }
  } else {
    console.error(`Unknown build target "${buildTarget}", expected self, ${Object.keys(platforms).join(', ')}, or nothing for all`)
    process.exitCode = 1
    return
  }

  // keep building the rest when one fails, then report every failure
  const failed = []
  for (const [name, targets] of builds) {
    try {
      await build({ targets })
    } catch (err) {
      console.error(`Error during ${name} build:`, err)
      failed.push(name)
    }
  }

  if (failed.length) {
    console.error(`Failed builds: ${failed.join(', ')}`)
    process.exitCode = 1
  }
}

buildAll()
