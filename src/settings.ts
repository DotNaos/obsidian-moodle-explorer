import { PluginSettingTab, Setting } from "obsidian";
import type SchoolDownloadPanelPlugin from "./main";

export type SchoolDownloadPanelSettings = {
  moodleBinary: string;
};

export const DEFAULT_SETTINGS: SchoolDownloadPanelSettings = {
  moodleBinary: "",
};

export class SchoolDownloadPanelSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: SchoolDownloadPanelPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "School Download Panel" });

    new Setting(containerEl)
      .setName("Moodle binary")
      .setDesc("Optional. Leave empty to auto-try /Users/oli/go/bin/moodle first and then moodle from PATH.")
      .addText((text) =>
        text
          .setPlaceholder("/Users/oli/go/bin/moodle")
          .setValue(this.plugin.settings.moodleBinary)
          .onChange(async (value) => {
            this.plugin.settings.moodleBinary = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }
}
