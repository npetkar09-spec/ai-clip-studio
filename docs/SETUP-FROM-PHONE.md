# Setup from an Android phone (no computer)

1. Install F-Droid (f-droid.org), then install **Termux** from F-Droid.
2. Create a free account at github.com. Create a new **public** repository named `ai-clip-studio`. Do not add a README or licence there.
3. On GitHub: Settings > Developer settings > Personal access tokens > Tokens (classic) > Generate new token. Tick `repo` and `workflow`. Set a short expiry (30 days). Copy the token. Treat it like a password and never share it, including with Claude.
4. Download `clip-studio-prototype.zip` to your phone's Downloads folder.
5. In Termux, run these one at a time (replace USERNAME, NAME, EMAIL):
```
termux-setup-storage
pkg update -y && pkg install -y git unzip
cd ~
cp ~/storage/downloads/clip-studio-prototype.zip .
unzip clip-studio-prototype.zip
cd clip-studio-prototype
git init -b main
git config user.name "NAME"
git config user.email "EMAIL"
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/ai-clip-studio.git
git push -u origin main
```
When asked for a password, paste the token (nothing shows while you paste).
6. On GitHub open the repo > Actions. The `test` workflow runs by itself. Open `build-apk` > Run workflow.
7. When the run finishes, open it and download the `ai-clip-studio-apk` artifact, extract the zip in your Files app, and install the APK (allow "install unknown apps" for your browser or Files app when asked).
8. If any step fails, copy the exact error text and send it back.
