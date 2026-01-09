// lib/structure.js
// Build a structured site representation for downstream content analysis.

const CTA_LABEL_RE = /(contact|enquir|inquir|quote|book|call|get started|free|schedule|request|learn more|buy|order|sign up|signup|subscribe)/i;

const norm = (value) => (value || '').toString().replace(/\s+/g, ' ').trim();
const uniqBy = (arr, keyer) => Array.from(new Map(arr.map((v) => [keyer(v), v])).values());

const pickDomain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

const extractAnchorCtas = (anchors = []) =>
  anchors
    .filter((anchor) => CTA_LABEL_RE.test(anchor.text || ''))
    .map((anchor) => ({ label: norm(anchor.text), href: anchor.href }))
    .filter((cta) => cta.label && cta.href);

const extractPanelCtas = (panels = []) =>
  panels
    .map((panel) => ({
      label: norm(panel.cta_label || ''),
      href: panel.cta_link || null,
      title: norm(panel.title || '')
    }))
    .filter((cta) => cta.label || cta.href);

const extractProjectCtas = (projects = []) =>
  projects
    .map((project) => ({
      title: norm(project.title || ''),
      href: project.cta_link || null
    }))
    .filter((cta) => cta.title || cta.href);

function buildPageStructure(page) {
  const headingCounts = {
    h1: page.h1_count || 0,
    h2: page.h2_count || 0,
    h3: page.h3_count || 0,
    h4: page.h4_count || 0,
    h5: page.h5_count || 0,
    h6: page.h6_count || 0
  };
  const linkCounts = {
    internal: page.link_internal_count || 0,
    external: page.link_external_count || 0,
    mailto: page.link_mailto_count || 0,
    tel: page.link_tel_count || 0,
    sms: page.link_sms_count || 0,
    whatsapp: page.link_whatsapp_count || 0
  };
  const ctaAnchors = extractAnchorCtas(page.anchors || []);
  const panelCtas = extractPanelCtas(page.service_panels || []);
  const projectCtas = extractProjectCtas(page.projects || []);
  const contactForms = Array.isArray(page.contact_form_links) ? page.contact_form_links : [];
  const uniqueCtas = uniqBy(
    [...ctaAnchors, ...panelCtas, ...projectCtas].filter((cta) => cta.href),
    (cta) => cta.href
  );

  return {
    url: page.url,
    title: page.title || null,
    page_language: page.page_language || null,
    meta_description: page.meta_description || null,
    headings: page.headings || {},
    heading_counts: headingCounts,
    word_count: page.word_count || 0,
    character_count: page.character_count || 0,
    text_blocks: Array.isArray(page.text_blocks) ? page.text_blocks : [],
    layout_blocks: Array.isArray(page.layout_blocks) ? page.layout_blocks : [],
    content_summary: page.content_summary || null,
    images: Array.isArray(page.images) ? page.images : [],
    image_count: page.image_count || 0,
    first_image_url: page.first_image_url || null,
    link_counts: linkCounts,
    ctas: {
      anchors: ctaAnchors,
      service_panels: panelCtas,
      projects: projectCtas,
      contact_forms: contactForms,
      total: uniqueCtas.length + contactForms.length
    },
    social: Array.isArray(page.social) ? page.social : [],
    contacts: page.contacts || { emails: [], phones: [] },
    service_panels: Array.isArray(page.service_panels) ? page.service_panels : [],
    projects: Array.isArray(page.projects) ? page.projects : [],
    testimonials: Array.isArray(page.testimonials) ? page.testimonials : []
  };
}

function buildOverview(startUrl, pages) {
  const totals = pages.reduce(
    (acc, page) => {
      acc.words += page.word_count || 0;
      acc.characters += page.character_count || 0;
      acc.images += page.image_count || 0;
      acc.ctas += (page.ctas?.total || 0);
      acc.contact_forms += Array.isArray(page.ctas?.contact_forms) ? page.ctas.contact_forms.length : 0;
      acc.h1 += page.heading_counts?.h1 || 0;
      acc.h2 += page.heading_counts?.h2 || 0;
      acc.h3 += page.heading_counts?.h3 || 0;
      acc.h4 += page.heading_counts?.h4 || 0;
      acc.h5 += page.heading_counts?.h5 || 0;
      acc.h6 += page.heading_counts?.h6 || 0;
      acc.links_internal += page.link_counts?.internal || 0;
      acc.links_external += page.link_counts?.external || 0;
      return acc;
    },
    {
      words: 0,
      characters: 0,
      images: 0,
      ctas: 0,
      contact_forms: 0,
      h1: 0,
      h2: 0,
      h3: 0,
      h4: 0,
      h5: 0,
      h6: 0,
      links_internal: 0,
      links_external: 0
    }
  );
  const pageCount = pages.length || 1;
  const languages = uniqBy(
    pages.map((page) => page.page_language).filter(Boolean),
    (lang) => lang.toLowerCase()
  );

  return {
    pages_count: pages.length,
    totals,
    averages: {
      words_per_page: totals.words / pageCount,
      characters_per_page: totals.characters / pageCount,
      images_per_page: totals.images / pageCount,
      ctas_per_page: totals.ctas / pageCount,
      internal_links_per_page: totals.links_internal / pageCount,
      external_links_per_page: totals.links_external / pageCount
    },
    languages
  };
}

function buildSiteStructure(startUrl, pages) {
  const structuredPages = pages.map(buildPageStructure);
  const overview = buildOverview(startUrl, structuredPages);
  return {
    site: {
      url: startUrl,
      domain: pickDomain(startUrl),
      crawled_at: new Date().toISOString(),
      pages_count: structuredPages.length
    },
    overview,
    pages: structuredPages
  };
}

module.exports = { buildSiteStructure };
