---
apiVersion: squaring/v0
kind: Change
id: publish-v0-1
name: Public release of v0.1
type: evolution
intent: >
  Take v0.1 public: open the GitHub repository, publish the package to npm,
  settle the CLI name, and make squaring itself the first squared repository.
targets:
  - square://squaring
semanticDiff:
  - The GitHub repository typicalday/squaring is public and the package ships to npm as `squaring` (unscoped) under the MIT license
  - The CLI installs a single `squaring` bin; the `square` alias no longer exists
  - The first squared repository is squaring itself, closing the calibration question
phase: done
status:
  done:
    - GitHub repository flipped to public
    - publish metadata in package.json (MIT license, single squaring bin, files allowlist, prepack)
    - LICENSE file added
    - README quickstart switched from npm link to npm install
    - npm publish of squaring 0.1.0 completed 2026-08-11
---

The three open questions in [[squaring]] — first-target-repo, npm-publish,
and square-bin-collision — were answered by this Change and promoted into
square://squaring#decision/first-target-dogfood,
square://squaring#decision/npm-public, and
square://squaring#decision/squaring-only-bin.

The published name ended up unscoped (`squaring`, not @typicalday/squaring);
change://review-fixes recorded that correction by superseding
square://squaring#decision/npm-public with
square://squaring#decision/npm-unscoped.
