import { DiscordSetting } from '@/components/settings/discord-setting';
import { SettingsSection } from '@/components/settings/settings-section';

/** Configurações > Conexões: o vínculo do Discord (um vínculo, não um login). */
export default function ConnectionsSettingsPage() {
  return (
    <SettingsSection section="conexoes">
      <DiscordSetting />
    </SettingsSection>
  );
}
