#!/bin/bash
# setup-quick-capture.sh
# Creates a macOS Quick Action (Automator Service) that sends selected text
# to the Meeting Actions quick-capture API for AI extraction.
#
# Usage:
#   1. Set your environment variables below
#   2. Run: bash scripts/setup-quick-capture.sh
#   3. Select text in any app → right-click → Services → "Capture to Meeting Actions"
#   4. Optional: assign a hotkey in System Settings → Keyboard → Keyboard Shortcuts → Services

# ── Configuration ─────────────────────────────────────────────────────
# Set these before running, or export them in your shell profile.

CAPTURE_URL="${CAPTURE_URL:-https://YOUR-APP.vercel.app/api/quick-capture}"
CAPTURE_SECRET="${CAPTURE_SECRET:-your-secret-here}"

# ── Validate ──────────────────────────────────────────────────────────

if [[ "$CAPTURE_URL" == *"YOUR-APP"* ]]; then
  echo "❌ Please set CAPTURE_URL before running this script."
  echo "   Example: export CAPTURE_URL=https://meeting-actions.vercel.app/api/quick-capture"
  exit 1
fi

if [[ "$CAPTURE_SECRET" == "your-secret-here" ]]; then
  echo "❌ Please set CAPTURE_SECRET before running this script."
  echo "   This must match the CAPTURE_SECRET env var on your Vercel deployment."
  echo "   Example: export CAPTURE_SECRET=my-secret-token-123"
  exit 1
fi

# ── Create the Quick Action ──────────────────────────────────────────

SERVICE_NAME="Capture to Meeting Actions"
WORKFLOW_DIR="$HOME/Library/Services/${SERVICE_NAME}.workflow"
CONTENTS_DIR="${WORKFLOW_DIR}/Contents"

echo "Creating Quick Action: ${SERVICE_NAME}"

mkdir -p "${CONTENTS_DIR}"

# Info.plist — tells macOS this is a Service that receives text
cat > "${CONTENTS_DIR}/Info.plist" << 'PLIST_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>Capture to Meeting Actions</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSSendTypes</key>
			<array>
				<string>NSStringPboardType</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
PLIST_EOF

# document.wflow — the Automator workflow definition
cat > "${CONTENTS_DIR}/document.wflow" << WFLOW_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AMApplicationBuild</key>
	<string>523</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Optional</key>
					<false/>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>AMActionVersion</key>
				<string>1.0.2</string>
				<key>AMApplication</key>
				<array>
					<string>Automator</string>
				</array>
				<key>AMBundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>AMCategory</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>AMIconName</key>
				<string>Terminal</string>
				<key>AMKeywords</key>
				<array>
					<string>Shell</string>
					<string>Script</string>
					<string>Command</string>
					<string>Run</string>
					<string>Unix</string>
				</array>
				<key>AMName</key>
				<string>Run Shell Script</string>
				<key>AMProvides</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
					<string>#!/bin/zsh
# Read selected text from stdin
INPUT="\$(cat)"

if [ -z "\$INPUT" ]; then
  osascript -e 'display notification "No text selected" with title "Meeting Actions"'
  exit 0
fi

# Escape the text for JSON (handle quotes, newlines, backslashes, tabs)
ESCAPED=\$(printf '%s' "\$INPUT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

# POST to the quick-capture API
RESPONSE=\$(curl -s -w "\\n%{http_code}" -X POST "${CAPTURE_URL}" \\
  -H "Content-Type: application/json" \\
  -H "X-Capture-Secret: ${CAPTURE_SECRET}" \\
  -d "{\"text\": \$ESCAPED, \"source\": \"macOS Quick Capture\"}" \\
  --max-time 30)

# Split response body and status code
HTTP_CODE=\$(echo "\$RESPONSE" | tail -1)
BODY=\$(echo "\$RESPONSE" | sed '\$d')

if [ "\$HTTP_CODE" = "200" ]; then
  # Extract task count from response
  TASK_COUNT=\$(echo "\$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tasks',[])))" 2>/dev/null || echo "?")
  osascript -e "display notification \\"Extracted \$TASK_COUNT action items\\" with title \\"Meeting Actions\\" sound name \\"Glass\\""
else
  osascript -e "display notification \\"Failed (HTTP \$HTTP_CODE)\\" with title \\"Meeting Actions\\" sound name \\"Basso\\""
fi</string>
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>0</integer>
					<key>shell</key>
					<string>/bin/zsh</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>1.0.2</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>A1B2C3D4-E5F6-7890-ABCD-EF1234567890</string>
				<key>Keywords</key>
				<array>
					<string>Shell</string>
					<string>Script</string>
					<string>Command</string>
					<string>Run</string>
					<string>Unix</string>
				</array>
				<key>OutputUUID</key>
				<string>B2C3D4E5-F6A7-8901-BCDE-F12345678901</string>
				<key>UUID</key>
				<string>C3D4E5F6-A7B8-9012-CDEF-123456789012</string>
				<key>UnlocalizedApplications</key>
				<array>
					<string>Automator</string>
				</array>
				<key>arguments</key>
				<dict>
					<key>0</key>
					<dict>
						<key>default value</key>
						<integer>0</integer>
						<key>name</key>
						<string>inputMethod</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<integer>0</integer>
						<key>uuid</key>
						<string>0</string>
					</dict>
					<key>1</key>
					<dict>
						<key>default value</key>
						<string>/bin/zsh</string>
						<key>name</key>
						<string>shell</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<integer>0</integer>
						<key>uuid</key>
						<string>1</string>
					</dict>
					<key>2</key>
					<dict>
						<key>default value</key>
						<string></string>
						<key>name</key>
						<string>source</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<integer>0</integer>
						<key>uuid</key>
						<string>2</string>
					</dict>
				</dict>
				<key>isViewVisible</key>
				<true/>
				<key>location</key>
				<string>529.000000:620.000000</string>
				<key>nibPath</key>
				<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
			</dict>
			<key>isViewVisible</key>
			<true/>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>
WFLOW_EOF

# Refresh services database
/System/Library/CoreServices/pbs -update 2>/dev/null

echo ""
echo "✅ Quick Action installed: ${WORKFLOW_DIR}"
echo ""
echo "Next steps:"
echo "  1. You may need to log out and back in (or restart) for it to appear"
echo "  2. Select text in any app → right-click → Services → '${SERVICE_NAME}'"
echo "  3. Optional: assign a keyboard shortcut in:"
echo "     System Settings → Keyboard → Keyboard Shortcuts → Services"
echo ""
echo "Environment variables needed on Vercel:"
echo "  CAPTURE_SECRET = ${CAPTURE_SECRET}"
echo "  INBOUND_EMAIL_USER_ID = (already set if email ingestion works)"
