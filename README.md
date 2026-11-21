# Signal K MCP Operations

**Ask an AI assistant about your boat, in plain language.**

This Signal K plugin lets an AI assistant (such as ChatGPT/Codex or Claude) read the live data on your Signal K server and explain it to you: where you are, how your batteries and tanks are doing, which alarms are active, and why a reading has gone missing. It works on OpenPlotter and other Signal K installations.

It **only reads**. It cannot switch anything, change settings, steer the boat or restart your server.

> **Version 1.1.0** adds the vessel overview, search, batch reading, alarms, the usage guide and read-only user logins. Features marked **1.1** need version 1.1.0 or newer. If you have 1.0, update the plugin under **Appstore → Updates** in the Signal K Admin UI.

---

## What can I ask?

You don't need to know Signal K path names. Ask the way you would ask a crew member.

### Quick checks
| You ask | What the assistant does | Needs |
| --- | --- | --- |
| *"How is the boat doing?"* | Gets one overview: position, speed, heading, wind, depth, batteries, tanks, engines and active alarms. | 1.1 |
| *"Are there any alarms?"* | Lists active Signal K notifications (anchor, depth, battery and others), most serious first. | 1.1 |
| *"What's the house battery voltage and state of charge?"* | Searches for battery data and reads several values at once. | 1.1 |
| *"How much fresh water and diesel do we have left?"* | Reads tank levels and capacities and converts them to % and litres. | 1.1 |

### Underway or at anchor
| You ask | What the assistant does | Needs |
| --- | --- | --- |
| *"What's our speed and course?"* | Reads speed over ground (knots) and course (degrees). | 1.1 |
| *"How much water is under the keel?"* | Reads the depth sensors and explains below-transducer, below-keel and below-surface. | 1.1 |
| *"What is the true wind doing?"* | Reads wind speed and direction and explains apparent versus true wind. | 1.1 |
| *"How warm is the engine, and how many hours does it have?"* | Reads engine temperature (°C), revolutions (rpm) and run time. | 1.1 |

### When something looks wrong
| You ask | What the assistant does | Needs |
| --- | --- | --- |
| *"Why has my wind data disappeared?"* | Checks whether the value exists, when it last updated, and whether a data connection reports errors. | 1.0 |
| *"Is this battery reading still fresh?"* | Reports the value, its timestamp and its age against your freshness limit (default 5 minutes). | 1.0 |
| *"Where is my depth reading coming from?"* | Shows which source (for example an NMEA 2000 sensor) supplies the value and which other sources exist. | 1.0 |
| *"Which data connections have a problem?"* | Lists your configured connections and which ones report errors (admin only). | 1.0 |
| *"What data is available on this boat?"* | Lists the data paths you allowed it to read, and installed plugins (admin only). | 1.0 |

### Example conversation

This is an illustration of the kind of answer you can expect. Real answers depend on your boat's data and the AI you use.

> **You:** How is the boat doing? We're at anchor.
>
> **Assistant:** Everything looks calm. You're at 52.37° N, 4.89° E, moving at 0.1 knots (normal swinging at anchor). Depth below the keel is 3.4 m. Apparent wind is 12 knots from 40° to starboard. The house battery is at 12.7 V and 83 % charged; the start battery is at 12.6 V. Fresh water is at 40 % (about 80 L) and diesel at 65 %. There is one warning: *"Low fuel"* in the port day tank. All readings are less than 10 seconds old.

The assistant converts Signal K's internal units to knots, degrees, °C, %, litres and rpm, and tells you when data is old. A missing or stale value does **not** prove that a sensor is broken: the instruments may be switched off, or a connection may have stopped.

---

## What it will never do

- **No control.** It cannot switch circuits, change the autopilot, acknowledge alarms, change settings or restart services. There is no "write" function in the plugin at all.
- **No navigation advice.** It is a diagnostic and information aid, not a navigation instrument. Always check your primary instruments for anything safety-critical.
- **No secrets.** It never returns passwords, tokens, connection settings or log files.
- **Only what you allow.** It reads only the data areas you choose (by default: navigation, environment, electrical, propulsion, tanks and notifications), and it respects your Signal K user permissions.

**Privacy note:** the values the assistant reads, such as your position, are sent to the AI service you use (for example OpenAI or Anthropic), the same as anything else you type into it. If you don't want to share your position, remove `navigation` from the allowed data areas.

---

## What you need

- A **Signal K server** (2.31 or newer), for example on an **OpenPlotter** Raspberry Pi, with **security enabled** (user login turned on).
- The server reachable over **HTTPS** from the computer where your AI app runs. On the boat's own network this is usually your OpenPlotter address.
- An **AI app that supports remote MCP servers with custom headers**. See [Connect your AI app](#5-connect-your-ai-app) below.
- About **30 minutes**, and a terminal on the Raspberry Pi for one step (creating a secret key). Every command is given below.

### What do these words mean?

- **Signal K**: the open data standard and server that collects your boat's instrument data (GPS, wind, depth, batteries…) in one place.
- **MCP (Model Context Protocol)**: a standard way for AI apps to use external tools. This plugin is an MCP "server"; your AI app is the "client".
- **Path**: Signal K's name for a value, such as `environment.depth.belowKeel`. You don't need to type these; the assistant finds them.
- **Token**: a login pass from Signal K for a user or device. It tells the plugin *who* is asking.
- **MCP key**: an extra secret password that only this plugin and your AI app know. Both the token and the key are needed.


---

## Set it up step by step

The [installation guide](docs/INSTALLATION.md) has full details. These are the steps.

### 1. Install the plugin
In the Signal K Admin UI, open **Appstore → Available**, search for **MCP Operations & Diagnostics**, click install, and restart Signal K when asked. The plugin starts disabled.

### 2. Create the MCP key
On the Raspberry Pi, open a terminal and create a random key:

```sh
openssl rand -hex 32
```

Copy the result somewhere safe. Never post it in forums, screenshots or chats. Then store it in a protected file that Signal K reads when it starts. On OpenPlotter, run these commands:

```sh
sudo install -m 600 -o root -g root /dev/null /etc/signalk-mcp-ops.env
sudoedit /etc/signalk-mcp-ops.env
```

In the editor, add one line, save and close:

```text
SIGNALK_MCP_OPS_KEY=<paste your key here>
```

Tell Signal K to load this file. Run `sudo systemctl edit signalk.service`, add these two lines, save, then restart Signal K:

```ini
[Service]
EnvironmentFile=/etc/signalk-mcp-ops.env
```

```sh
sudo systemctl daemon-reload
sudo systemctl restart signalk.service
```

(Run the `install` command only once: it empties an existing file. See the [installation guide](docs/INSTALLATION.md#deploy-the-mcp-key) for other setups.)

### 3. Configure the plugin
In the Admin UI, open **Server → Plugin Config → MCP Operations & Diagnostics**:

| Setting | What to enter |
| --- | --- |
| **Allowed hosts** | The address your AI app uses to reach the server, **with port**, without `https://`. For example `openplotter.local:3443` or `192.168.1.20:3443`. |
| **Allowed origins** | Leave empty. Delete any empty row. |
| **Path prefixes** | The data areas the assistant may read. The default is fine for most boats; remove `navigation` to keep your position private. |
| **Stale after seconds** | When a value counts as "old". The default 300 (5 minutes) suits most boats. |

Enable the plugin and click **Submit**. The plugin status should show **Read-only MCP ready**.

### 4. Create a login for the assistant
Create a separate Signal K user just for the AI, so you can remove its access at any time:

- In **Security → Users**, add a user such as `mcp-reader` with **Read Only** permission, then [generate a token](docs/INSTALLATION.md#dedicated-read-only-user) for it (version 1.1 or newer).
- Version 1.0 needs an **admin** token. Connection and plugin checks always need admin, in every version.

Keep the token as private as the MCP key.

### 5. Connect your AI app
Your AI app needs three things:

```text
Address:        https://<your-server>:<port>/plugins/signalk-mcp-ops/mcp
Authorization:  Bearer <your Signal K token>
X-MCP-Ops-Key:  <your MCP key>
```

The exact steps depend on the app. Only **Codex desktop on Windows** has been tested on a live boat; the other examples follow each app's documented settings.

#### Codex (ChatGPT): `~/.codex/config.toml`

Set the environment variables `SIGNALK_TOKEN` and `SIGNALK_MCP_OPS_KEY` on your computer, then add:

```toml
[mcp_servers.signalk]
url = "https://openplotter.local:3443/plugins/signalk-mcp-ops/mcp"
bearer_token_env_var = "SIGNALK_TOKEN"
env_http_headers = { "X-MCP-Ops-Key" = "SIGNALK_MCP_OPS_KEY" }
```

#### Claude Code

```sh
claude mcp add --transport http signalk https://openplotter.local:3443/plugins/signalk-mcp-ops/mcp \
  --header "Authorization: Bearer <your token>" \
  --header "X-MCP-Ops-Key: <your MCP key>"
```

#### Claude Desktop: through the `mcp-remote` bridge

Claude Desktop's built-in connectors need OAuth, which this plugin doesn't offer. The free [`mcp-remote`](https://github.com/geelen/mcp-remote) bridge (requires Node.js on your computer) sends the headers instead. In **Settings → Developer → Edit Config**, add:

```json
{
  "mcpServers": {
    "signalk": {
      "command": "npx",
      "args": ["mcp-remote", "https://openplotter.local:3443/plugins/signalk-mcp-ops/mcp",
               "--header", "Authorization:${SK_AUTH}",
               "--header", "X-MCP-Ops-Key:${SK_KEY}"],
      "env": { "SK_AUTH": "Bearer <your token>", "SK_KEY": "<your MCP key>" }
    }
  }
}
```

Write the headers without a space after the colon, as shown; this avoids a known Windows issue.

AI apps that only accept OAuth sign-in (no custom headers) are not supported yet.

### 6. Try it
Ask *"What tools do you have for my boat?"* and then *"How is the boat doing?"*. If you get an error, see the troubleshooting table below.

---

## Troubleshooting

| What you see | What it usually means | What to do |
| --- | --- | --- |
| Plugin status is not **Read-only MCP ready** | The key is missing or too short, or a setting is invalid | Check step 2 (restart Signal K after creating the key) and remove empty rows in *Allowed origins*. |
| Error **503 / PLUGIN_DISABLED** | Plugin not started, or Signal K security is off | Enable the plugin; turn on Signal K security. |
| Error **401** | The token or MCP key is wrong or expired | Check both values in your AI app; create a new token if it expired. |
| Error **403 / FORBIDDEN_ORIGIN_OR_HOST** | The address in *Allowed hosts* doesn't match exactly | Use the same host **and port** your AI app connects to. |
| **PATH_NOT_ALLOWED** | That data area isn't in *Path prefixes* | Add it in the plugin settings (for alarms: `notifications`). |
| **PATH_UNAVAILABLE** | No data there, or this user may not read it | Check the sensor and your Signal K access rules. |
| **ADMIN_REQUIRED** | Connection and plugin checks need an admin token | Use an admin token only if you need those checks. |
| Values are **stale** | The data stopped updating | Instruments may be off; ask *"Why is this reading stale?"* |

More help: [installation troubleshooting](docs/INSTALLATION.md#troubleshooting-startup).

---

## All tools

The assistant chooses these itself; you don't have to name them.

| Tool | In plain words | Needs |
| --- | --- | --- |
| `get_vessel_overview` | Snapshot of the whole boat | 1.1 |
| `search_paths` | Find data by everyday words | 1.1 |
| `read_paths` | Read up to 25 values at once, optionally in knots/°C/%/litres | 1.1 |
| `list_alarms` | Active alarms and warnings | 1.1 |
| `get_usage_guide` | Teaches the assistant Signal K units and safety rules | 1.1 |
| `read_path` | Read one value with its age and source | 1.0 |
| `list_paths` | List the available data | 1.0 |
| `inspect_path_sources` | Which devices supply a value | 1.0 |
| `diagnose_missing_path` | Why a value is missing or old | 1.0 |
| `get_server_info`, `get_security_status` | What the plugin can do and how it is protected | 1.0 |
| `list_connections`, `get_connection_status` | Data connections and their errors (admin) | 1.0 |
| `list_plugins` | Installed Signal K plugins (admin) | 1.0 |

Exact inputs, outputs and limits are in the [specification](SPEC.md).

---

## Version and compatibility

**Current version: 1.1.0.** Check [npm](https://www.npmjs.com/package/signalk-mcp-ops) or [GitHub releases](https://github.com/eriksnijder/signalk-mcp-ops/releases).

- **Automated tests:** Node.js 22 and 24; Signal K **2.31.0** and **2.35.1**.
- **Tested on a live boat:** version 1.0 on Signal K **2.31.0 / OpenPlotter Raspberry Pi** with Codex desktop on Windows.
- **Known limitation:** Signal K 2.31.0 itself can return a technical error page for badly formed requests before the plugin sees them. See [deployment responsibilities](SECURITY.md#deployment-responsibilities).

Details: [compatibility and validation](docs/COMPATIBILITY.md).

## Learn more

- [Installation and client setup](docs/INSTALLATION.md)
- [Read-only users and permissions](docs/READ-ONLY-USERS.md)
- [Tools, inputs and response formats](SPEC.md)
- [Security and private vulnerability reporting](SECURITY.md)
- [Server log access](docs/SERVER-LOGS.md): not available through MCP yet
- [Release procedure](docs/PUBLISHING.md) · [1.0 acceptance checklist](docs/RELEASE-1.0.md)

## Contributing and development

Questions, ideas and bug reports are welcome in [GitHub issues](https://github.com/eriksnijder/signalk-mcp-ops/issues). Please report security problems privately as described in [SECURITY.md](SECURITY.md).

Requires Node.js 22 or newer:

```sh
npm ci --ignore-scripts
npm test
npm run audit:runtime
npm run verify:package
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

MIT licensed. Design references and acknowledgements are in [the architecture notes](ARCHITECTURE.md#design-references).
