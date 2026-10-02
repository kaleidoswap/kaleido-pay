# KaleidoPay demo videos

Recorded from Rate on the iOS simulator against live mainnet quotes; nothing was paid.

| File | Shows |
|---|---|
| `kaleidopay-1-pay-with-what-you-have.mp4` (40 s) | Scan a universal code, see the receiver's rails, Bark paying their Bark address for no fee, every way to pay including Electrum swap providers on Nostr, switching route |
| `kaleidopay-2-the-receiver-decides.mp4` (35 s) | A receiver who prefers on-chain: their choice and the best price marked separately, paying their way |
| `kaleidopay-demo-reel.mp4` (75 s) | Both, back to back |

## Re-recording

1. `xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100`
2. Start `mark.sh start demo1` and `xcrun simctl io <udid> recordVideo --codec=h264 demo1-raw.mov`; run `mark.sh <step>` as you tap through, then stop the recording with Ctrl-C.
3. Put the kept time ranges in `segments` and the caption times (on the cut timeline) in `steps` of `demo1.json`, then `python3 compose.py demo1.json` (needs ffmpeg and Pillow).

`ks-full.png` is the KaleidoSwap logo; `bark.png` is Second's mark from second.tech/docs.
