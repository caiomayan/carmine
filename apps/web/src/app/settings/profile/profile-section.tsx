import { ProfileSettings } from '@/components/settings/profile-settings';
import { SettingsSection } from '@/components/settings/settings-section';

/** Configurações > Perfil: o nome de exibição e o Perfil privado. */
export function ProfileSection() {
  return (
    <SettingsSection section="perfil">
      <ProfileSettings />
    </SettingsSection>
  );
}
