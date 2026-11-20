# Open Paleo tools

Tools built for the [Open Paleo](https://github.com/open-paleo) project, one folder per tool.
Each tool is its own package, with its own version, changelog and license.

| Tool | What it does | License |
|---|---|---|
| [outline-tracer](outline-tracer/) | Traces skeletal reconstructions into outlines for open-paleo/media, in Node or a browser | GPL-2.0-or-later |
| [tree-extractor](tree-extractor/) | Extracts phylogenetic trees from figure images into Newick and Nexus, with a browser viewer | MIT |

## Working here

Requires Node 24 or later. The tools are npm workspaces: dependencies are installed once, from
this folder, and each tool's commands are run from its own folder.

```sh
npm install
cd tree-extractor
npm test
```

## Releases

A tool is released by pushing a tag that names it and its version, `tree-extractor-v1.2.3`,
with that version in the tool's `package.json` and its entry in the tool's `CHANGELOG.md`. The
tool's release workflow runs its checks and attaches the packed tarball to a GitHub release.
Tags from before the tools shared a repository are plain `v1.2.3` and belong to the tree
extractor.

## Conventions

All code follows [CONTRIBUTING.md](CONTRIBUTING.md).
