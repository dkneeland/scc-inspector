---
description: Safely add a new dependency to package.json
---
1. Acknowledge the requested npm package and version (or lack of version).
2. Open `package.json` (or `client/package.json` or `server/package.json` depending on where it's needed) and add the requested package to the `dependencies` or `devDependencies` object.
3. Run `npm install` to install the dependency and update package-lock.json.
4. Provide a short summary verifying that the dependency was successfully installed.