import { ProfileSection } from './perfil/profile-section';

/**
 * A raiz de Configurações. No desktop abre a seção Perfil (a navegação lateral já está ao lado);
 * no celular a raiz é a lista de seções, que a moldura desenha, então o conteúdo some.
 */
export default function SettingsIndexPage() {
  return (
    <div className="max-md:hidden">
      <ProfileSection />
    </div>
  );
}
