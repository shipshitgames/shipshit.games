cask "shipshitgames-studio" do
  version "0.1.0"
  sha256 "REPLACE_WITH_DMG_SHA256"

  url "https://github.com/shipshitgames/shipshit.games/releases/download/desktop-v#{version}/Ship.Shit.Games.Studio-#{version}.dmg",
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
