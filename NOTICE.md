# Third-party software

The project's original code is licensed under MIT. Bundled third-party software
retains its own copyright and license; the project license does not replace those
terms.

## Cosmograph and Cosmos

The plugin bundles Cosmograph and Cosmos 2.5.1 under CC BY-NC 4.0. Cosmograph's
[licensing page](https://cosmograph.app/docs-general/citing-and-licensing/)
describes non-commercial use and separate commercial licensing. The visualization
retains its on-screen attribution.

Rokotyan, N., Stukova, O., Kolmakova D. & Ovsyannikov, D. (2022).
Cosmograph: GPU-accelerated Force Graph Layout and Rendering [Computer software].
https://cosmograph.app/

This project modifies the installed libraries through the tracked `patches/`
files. Changes include asynchronous coordinate reads, label scheduling,
simulation-space initialization, cluster texture sampling, and independent
search-match rings. The upstream code retains its original license.

## Release notices

`package.zip` includes this notice, the project MIT license, and
`third-party-runtime.txt`, generated from the installed production dependency
tree with package identities and available license/copyright/notice files.
That tree can include dependencies removed by the production bundler.
`third-party-mentions.txt` and `third-party-communities.txt` retain the notices
for the Markdown parser and Rust community implementation.
