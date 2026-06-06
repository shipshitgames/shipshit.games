cask "shipshitgames-studio" do
  version "0.1.0"
  sha256 "61723faaf7fb943f120c43e35d8858d488d7088c20b2f058ffd1fb04ce856d18"

  url "https://github.com/shipshitgames/shipshit.games/releases/download/desktop-v#{version}/Ship%20Shit%20Games%20Studio-#{version}-arm64.dmg",
      verified: "github.com/shipshitgames/shipshit.games/"
  name "Ship Shit Games Studio"
  desc "Studio cockpit for Ship Shit Games"
  homepage "https://shipshit.games/"

  app "Ship Shit Games Studio.app"

  zap trash: [
    "~/Library/Application Support/Ship Shit Games Studio",
    "~/Library/Preferences/games.shipshit.studio.plist",
    "~/Library/Saved Application State/games.shipshit.studio.savedState",
  ]
end
