import { AppearanceSetting } from '@/components/settings/appearance-setting';
import { SettingsSection } from '@/components/settings/settings-section';

/** Configurações > Aparência: o tema do site. */
export default function AppearanceSettingsPage() {
  return (
    <SettingsSection section="aparencia">
      <AppearanceSetting />
    </SettingsSection>
  );
}
