import { PLATFORM_BRAND } from './seed-data.js';

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Page Conditions générales d’utilisation — modèle courant pour une plateforme
 * de formation en ligne exploitée au Bénin (texte générique, à faire valider par un juriste local).
 */
export function renderCguPageHtml() {
  const brand = esc(PLATFORM_BRAND);
  return `
    <article class="panel surface-card legal-page">
      <p class="legal-page-back"><a data-router href="/">← Accueil</a></p>
      <header class="legal-page-head">
        <h1 class="h1">Conditions générales d’utilisation</h1>
        <p class="muted legal-page-meta">Dernière mise à jour : avril 2026 · République du Bénin</p>
      </header>

      <div class="legal-page-body body-lg">
        <h2 class="h3 legal-h2">1. Objet</h2>
        <p>
          Les présentes conditions générales d’utilisation (« CGU ») régissent l’accès et l’utilisation du site
          et des services proposés par <strong>${brand}</strong> (ci-après « la Plateforme »), notamment les contenus de formation,
          les webinaires, les espaces d’inscription et, le cas échéant, les fonctionnalités communautaires.
        </p>
        <p>
          En créant un compte, en vous inscrivant à un parcours ou à un webinaire, ou en naviguant sur la Plateforme,
          vous reconnaissez avoir pris connaissance des présentes CGU et les accepter sans réserve.
        </p>

        <h2 class="h3 legal-h2">2. Mentions et contact</h2>
        <p>
          L’éditeur de la Plateforme est le responsable désigné par ${brand}. Les coordonnées de contact sont :
          AdresseAbomey Calavi, Aïfa, 
          E-mail: info@laforge-hub.com, 
          Téléphone: +229 0167153974.
        </p>

        <h2 class="h3 legal-h2">3. Services</h2>
        <p>
          La Plateforme propose un accès à des ressources pédagogiques (vidéos, supports, exercices), à des webinaires
          en direct ou en replay, et à des services associés (inscription, suivi de progression, e-mails d’information selon vos choix).
          Les contenus et le calendrier peuvent évoluer ; ${brand} s’efforce d’en assurer la continuité sans garantie de résultat
          ni d’absence d’interruption technique.
        </p>

        <h2 class="h3 legal-h2">4. Compte utilisateur</h2>
        <p>
          Vous vous engagez à fournir des informations exactes, à maintenir la confidentialité de vos identifiants et à notifier
          tout usage non autorisé. Vous êtes responsable de l’activité réalisée depuis votre compte.
          ${brand} se réserve le droit de suspendre ou clôturer un compte en cas de violation des présentes CGU ou de la loi.
        </p>

        <h2 class="h3 legal-h2">5. Inscriptions — formation et webinaires</h2>
        <p>
          Les inscriptions aux parcours et aux sessions en ligne sont soumises aux disponibilités affichées sur la Plateforme.
          Les modalités pratiques (liens de connexion, replays, annulations) sont précisées pour chaque offre.
          Toute fausse déclaration ou utilisation abusive peut entraîner le refus d’accès ou l’exclusion.
        </p>

        <h2 class="h3 legal-h2">6. Propriété intellectuelle</h2>
        <p>
          Les contenus (textes, vidéos, graphismes, structure du site, marques) sont protégés par le droit d’auteur et le droit des marques.
          Sauf autorisation écrite, toute reproduction, représentation, adaptation ou exploitation commerciale est interdite.
        </p>

        <h2 class="h3 legal-h2">7. Données personnelles et communications</h2>
        <p>
          Les données collectées sont traitées conformément aux engagements affichés sur la Plateforme et aux exigences applicables
          au Bénin en matière de protection des personnes physiques à l’égard des traitements de données à caractère personnel,
          notamment dans le cadre du cadre juridique national et régional en vigueur.
        </p>
        <p>
          Si vous acceptez de recevoir des e-mails d’information (annonces d’activités, webinaires), vous pouvez retirer ce consentement
          selon les modalités indiquées dans les messages ou auprès du contact désigné par ${brand}.
        </p>

        <h2 class="h3 legal-h2">8. Responsabilité</h2>
        <p>
          La Plateforme est fournie « en l’état ». Dans les limites autorisées par la loi béninoise, la responsabilité de ${brand}
          ne saurait être engagée pour des dommages indirects, perte de données, interruption de service ou contenus tiers accessibles via des liens.
          Les contenus pédagogiques ne constituent pas un conseil juridique, fiscal ou professionnel personnalisé.
        </p>

        <h2 class="h3 legal-h2">9. Force majeure</h2>
        <p>
          ${brand} ne pourra être tenue responsable du non-exécution de ses obligations en cas de force majeure ou d’événements hors de son contrôle raisonnable
          (pannes générales d’Internet, catastrophes, décisions administratives, etc.).
        </p>

        <h2 class="h3 legal-h2">10. Modification des CGU</h2>
        <p>
          Les CGU peuvent être mises à jour. La date de mise à jour figure en tête de page. L’utilisation continue des services après modification
          vaut acceptation des nouvelles conditions, sauf disposition contraire impérative.
        </p>

        <h2 class="h3 legal-h2">11. Résiliation</h2>
        <p>
          Vous pouvez cesser d’utiliser la Plateforme à tout moment. ${brand} peut mettre fin à l’accès aux services en respectant les obligations légales
          applicables, notamment en matière de conservation ou de suppression des données.
        </p>

        <h2 class="h3 legal-h2">12. Droit applicable et litiges</h2>
        <p>
          Les présentes CGU sont régies par le <strong>droit de la République du Bénin</strong>.
          En l’absence de règlement amiable, les litiges relatifs à leur interprétation ou à leur exécution relèvent de la compétence
          des <strong>juridictions béninoises compétentes</strong>, sous réserve des règles d’ordre public et des voies de recours prévues par la loi.
        </p>
        <p>
          Pour toute réclamation relative aux services, vous pouvez contacter ${brand} aux coordonnées indiquées sur la Plateforme
          avant toute saisine judiciaire, afin de tenter une résolution à l’amiable.
        </p>
      </div>
    </article>`;
}
