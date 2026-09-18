# Pushing and releasing FIRE Projector

This project uses `main` for the source code and immutable version tags for desktop releases.

## Normal code changes

From the repository folder:

```powershell
git switch main
git pull --ff-only origin main

# Make and test your changes.
npm test

git status
git add .
git commit -m "Describe the change"
git push origin main
```

Pushing `main` alone does not publish an installer. It only updates the source branch.

At release time, the tag and `main` must point to the same commit. After a release, `main` may move ahead while you work on the next unreleased change; that is normal. The next release tag must then be created from the new current `main` commit.

## Publishing a desktop release

Use a new semantic version for every release. Do not reuse or move a tag that has already been published.

1. Make sure the working tree is clean and `main` is current.
2. Set the next version in both `package.json` and `package-lock.json`:

   ```powershell
   npm version 1.2.5 --no-git-tag-version
   ```

   Replace `1.2.5` with the next version. `npm version` updates the two package files without creating a Git tag.

3. Commit and push the version bump to `main`:

   ```powershell
   git add package.json package-lock.json
   git commit -m "Release v1.2.5"
   git push origin main
   ```

4. Create a tag on that exact `main` commit and push the tag:

   ```powershell
   git tag -a v1.2.5 -m "Release v1.2.5"
   git push origin v1.2.5
   ```

5. Open the repository's **Actions** tab and wait for **Desktop release** to finish. It runs the tests, builds the Windows installer, and publishes the GitHub Release.

The workflow refuses to publish if:

- the tag is not in `vX.Y.Z` format;
- the tag version does not match `package.json`; or
- the tag does not point to the exact current `origin/main` commit.

## Verify that a release matches `main`

After pushing the tag, these commands should show the same commit hash:

```powershell
git fetch origin --tags
git rev-parse origin/main
git rev-parse v1.2.5^{commit}
```

The GitHub Release is built from that tagged commit. Its installer is a release asset, so it is downloaded from the Release page rather than with `git pull`.

## If a release fails

Rerun the failed workflow for the same tag if the failure was temporary and `main` has not moved on. If the source code needs a fix, commit the fix to `main`, bump to a new version, and create a new tag. Do not rewrite a published tag.

The app's **Check updates** feature uses the latest published GitHub Release. Existing installed versions keep their local saved plans when updated.
