// this file uses electron-builder to create executables for various operating systems
// usage is defined in the package.json run scripts
const builder = require('electron-builder')

async function build () {
  const buildTarget = process.env.BUILD_TARGET

  // quick builds; quick means doing only one kind of packaging per OS rather than all packaging methods so it builds faster (useful for testing purposes)
  if (buildTarget === 'self') {
    if (process.platform === 'linux') {
      await builder.build({
        targets: builder.Platform.LINUX.createTarget('AppImage', builder.Arch[process.arch])
      })
    }
    if (process.platform === 'darwin') {
      await builder.build({
        targets: builder.Platform.MAC.createTarget('zip', builder.Arch[process.arch])
      })
    }
    if (process.platform === 'win32') {
      await builder.build({
        targets: builder.Platform.WINDOWS.createTarget('zip', builder.Arch[process.arch])
      })
    }
  } else {
    // full builds; all types of packaging per OS
    if (buildTarget === 'linux') { // full linux build
      await builder.build({
        targets: builder.Platform.LINUX.createTarget()
      })
    } else if (buildTarget === 'mac') { // full mac build
      await builder.build({
        targets: builder.Platform.MAC.createTarget()
      })
    } else if (buildTarget === 'win') { // full windows build
      await builder.build({
        targets: builder.Platform.WINDOWS.createTarget()
      })
    } else { // full build of everything
      await builder.build({
        targets: builder.Platform.LINUX.createTarget()
      })
      await builder.build({
        targets: builder.Platform.MAC.createTarget()
      })
      await builder.build({
        targets: builder.Platform.WINDOWS.createTarget()
      })
    }
  }
}

build().catch(err => {
  console.error('Error during build:', err)
})
