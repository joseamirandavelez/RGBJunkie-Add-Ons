# RGBJunkie — Wallpaper Engine 2

RGBJunkie port of [SignalRGB Wallpaper Engine](https://github.com/qiangqiang101/SignalRGB-Wallpaper-Engine) by I'm Not MentaL.

Sync your **Wallpaper Engine** or **Lively Wallpaper** RGB matrix with the rest of your desk through RGBJunkie effects.

## Prerequisites

- [RGBJunkie](https://rgbjunkie.com) (0.3.1+ with Wallpaper Engine network plugin support)
- [.NET 10 Runtime](https://dotnet.microsoft.com/download/dotnet/10.0) (for the Wallpaper Engine / Lively companion)
- [Wallpaper Engine](https://store.steampowered.com/app/431960/Wallpaper_Engine/) **or** [Lively Wallpaper](https://github.com/rocksdanister/lively/releases)
- Install the companion from the [upstream releases](https://github.com/qiangqiang101/SignalRGB-Wallpaper-Engine/releases) (Wallpaper Engine workshop / Lively build)

## Install (RGBJunkie plugin only)

1. Copy the `Network/Wallpaper` folder into your user plugin directory:

   ```
   %APPDATA%\RGBJunkie\plugins\Network\Wallpaper\
   ```

   You should end up with:

   ```
   %APPDATA%\RGBJunkie\plugins\Network\Wallpaper\Wallpaper_Engine.js
   ```

2. Restart RGBJunkie (or **Rescan hardware**).

3. **Wallpaper Engine 2** appears in the device tree (main screen UDP `127.0.0.1:8133`; second screen `8134` if the companion is running).

## Usage

- Set **Lighting Mode** to **Canvas** so colors come from your active RGBJunkie effect.
- Adjust **Aspect Ratio** and **Display Size** to match your monitor.
- Place the virtual matrix on the workspace canvas so effect sampling lines up with your wallpaper grid.

## Differences from SignalRGB

| SignalRGB | RGBJunkie |
|-----------|-----------|
| `ControllableParameters()` | `export const rgbjunkie` + `settings` |
| `Initialize` / `Render` / `Shutdown` | `initialize` / `render` / `shutdown` |
| Auto repo install via srgbmods | Manual copy to `%APPDATA%\RGBJunkie\plugins\` |
| `DeviceType: wifi` | `deviceKind: network` |

Protocol and UDP packet format are unchanged from upstream.

## Updating from upstream

```bash
# From RGBJunkie repo root (maintainers)
node scripts/convert-srgb-wallpaper-to-rgbj.mjs
```

Re-downloads are not automatic — re-run the converter after pulling a new `wallpaper2.js` from upstream.

## License

MIT — same as [upstream SignalRGB-Wallpaper-Engine](https://github.com/qiangqiang101/SignalRGB-Wallpaper-Engine/blob/main/LICENSE).

## Credits

- Original plugin: [qiangqiang101 / SignalRGB-Wallpaper-Engine](https://github.com/qiangqiang101/SignalRGB-Wallpaper-Engine)
- RGBJunkie port: community plugin (not bundled with the RGBJunkie installer)
