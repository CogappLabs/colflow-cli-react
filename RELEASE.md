# Release process

Builds + publishes binaries via GitHub Actions on every `v*` tag, then updates the Homebrew formula at `CogappLabs/homebrew-tap`.

## One-time setup

The release workflow needs a `TAP_GITHUB_TOKEN` secret on this repo. It must be a PAT (fine-grained or classic) with `Contents: Read & write` permission on `CogappLabs/homebrew-tap`.

1. Create the PAT (fine-grained recommended):
   - https://github.com/settings/personal-access-tokens/new
   - **Resource owner:** CogappLabs
   - **Repository access:** Only `homebrew-tap`
   - **Repository permissions:** Contents → Read and write
   - Expiry: long, e.g. 1 year

2. Copy the token, then set it on this repo:

   ```sh
   gh secret set TAP_GITHUB_TOKEN -R CogappLabs/colflow-cli-react -b "<paste-pat>"
   ```

3. Verify it's there:

   ```sh
   gh secret list -R CogappLabs/colflow-cli-react
   ```

## Cutting a release

```sh
git tag v0.4.0
git push origin v0.4.0
```

The `release.yml` workflow then:
1. Builds standalone binaries via `bun build --compile` for darwin/arm64, darwin/amd64, linux/amd64
2. Tarballs each + computes sha256
3. Creates a GitHub release with all tarballs attached
4. Templates `Formula/colflow.rb` with the new version + URLs + sha256s
5. Pushes the formula to `CogappLabs/homebrew-tap` using `TAP_GITHUB_TOKEN`

Watch:

```sh
gh run watch -R CogappLabs/colflow-cli-react
```

## If something fails

If the formula-update step fails (usually missing secret), set it then re-run that job:

```sh
gh run list -R CogappLabs/colflow-cli-react --workflow release.yml -L 1
gh run rerun -R CogappLabs/colflow-cli-react --failed <run-id>
```

Or bump the tag and re-push:

```sh
git tag -d v0.4.0
git push origin :refs/tags/v0.4.0
git tag v0.4.1
git push origin v0.4.1
```

## Replacing the Go binary

The TS formula clobbers the same `Formula/colflow.rb` file the Go release used. Existing users on the Go binary will switch to the TS binary on their next `brew upgrade`.

If you want to keep the Go formula available under a different name, rename `Formula/colflow.rb` to `Formula/colflow-go.rb` in the tap repo before the first TS release lands. Otherwise the TS workflow will overwrite it.

## After first successful release

Verify install:

```sh
brew update
brew install CogappLabs/tap/colflow
colflow --help
```
