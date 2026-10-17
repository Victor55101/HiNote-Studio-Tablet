# V32 source reconstruction

Reconstructed from GitHub V31 (`170cef6b2d3fbf262efa17fc88f032b55a3666ef`) and the delivered V32 APK.

APK SHA-256: `5786eb7ef620f46217a1b347e85074d7f3d99ae924e96246a9de63001b79c514`.

The JavaScript and CSS files are extracted unchanged from V32. Python changes were recovered from the APK's Python 3.11 bytecode; Java changes were reconstructed against the APK's DEX. This is editable source, not a wrapper around compiled code.

Recovered behavior includes character-by-character formula navigation, calibrated delimiters, filled graph markers, graph zoom/pan, label collision avoidance, preview gesture isolation, the open document as a merge source, and remembered-folder saving of combined notebooks. Resource lists are deduplicated when shared files merge.

Validation of the reconstructed baseline: 80 Python tests pass. Representative grouped fractions (parentheses, brackets and absolute values), matrices with all three delimiter types, and a labeled graph produce the same complete stroke/placement data as the delivered V32 code, excluding random native stroke IDs.

The original local commits and Android signing private key were not present in the recovered workspace. The APK provides a reference for behavior, but cannot recover a signing private key. Later corrections are recorded in separate commits.
