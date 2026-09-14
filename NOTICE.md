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

## shadcn/ui components

The generated and adapted UI components from [shadcn/ui](https://github.com/shadcn-ui/ui)
retain the following notice independently of the development-only CLI dependency:

```text
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Release notices

`package.zip` includes this notice, the project MIT license, and
`third-party-runtime.txt`, generated from the installed production dependency
tree with package identities and available license/copyright/notice files.
That tree can include dependencies removed by the production bundler.
`third-party-mentions.txt` and `third-party-communities.txt` retain the notices
for the Markdown parser and Rust community implementation.
