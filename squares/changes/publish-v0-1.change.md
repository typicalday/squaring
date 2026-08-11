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
  - The GitHub repository typicalday/squaring is public and the package ships to npm as @typicalday/squaring under the MIT license
  - The CLI installs a single `squaring` bin; the `square` alias no longer exists
  - The first squared repository is squaring itself, closing the calibration question
phase: blocked
status:
  done:
    - GitHub repository flipped to public
    - publish metadata in package.json (MIT license, single squaring bin, files allowlist, prepack, publishConfig)
    - LICENSE file added
    - README quickstart switched from npm link to npm install
  blocked:
    - reason: >
        npm publish needs authentication; no npm login session or token
        exists on this machine, and only a human can run `npm login`.
      affects: [square://squaring]
  next:
    - run `npm publish` for 0.1.0 once npm authentication exists, then set this Change to done
---

The three open questions in [[squaring]] — first-target-repo, npm-publish,
and square-bin-collision — were answered by this Change and promoted into
square://squaring#decision/first-target-dogfood,
square://squaring#decision/npm-public, and
square://squaring#decision/squaring-only-bin.
