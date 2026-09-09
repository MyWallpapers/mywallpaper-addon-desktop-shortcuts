# Desktop Shortcuts

A Canvas add-on that arranges shortcuts on the Windows desktop. Add local files,
applications, folders and URLs, drag icons into a grid, or import shortcuts from
your personal and public Desktop folders.

The Canvas entry exports `mount(context)` and bundles React. A `process-v2`
companion speaks protocol version 5 and implements the Windows file picker,
Desktop enumeration, icon extraction and ShellExecute. Local paths and icon
positions belong to `layer.deviceSettings`; appearance belongs to layer settings.

## Development

Use Node.js 24, the package manager pinned in `package.json`, Rust and the MSVC
build tools on Windows.

```sh
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
cargo test --locked --manifest-path native/companion/Cargo.toml
```

The companion build is declared in `mywallpaper.config.json`. Run the MyWallpaper
CLI development preview to attach the companion and interact with the Canvas.
The file picker returns the full native path; browser file input paths are not
used to launch applications. Shortcuts open through Windows without a command
shell. Installed applications must be discoverable by Windows or selected with
their full path. `shell:Personal` and related folder links follow Windows folder
redirection, including OneDrive.

## Publication

After merging the reviewed source and passing quality checks, push the immutable
`v3.0.0` source tag. Open the add-on management page in MyWallpaper and select
that tag with an active lifetime entitlement. The platform owns the central
workflow, rebuilds and verifies the outputs, and publishes its immutable
transport. No publication workflow or MyWallpaper credential is needed in this
repository. A source tag alone does not publish to the catalogue.
