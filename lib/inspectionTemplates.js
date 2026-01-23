import templatesData from './inspection-templates.json'

const normalizeText = (value) => {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .trim()
}

const normalizeSpec = (value) => {
  return normalizeText(value)
    .replace(/[×xX＊*]/g, 'x')
    .replace(/ml/gi, '')
    .replace(/g/gi, '')
}

const buildIndex = () => {
  const map = new Map()
  templatesData.templates.forEach((template) => {
    const nameKey = normalizeText(template.productName)
    const specKey = normalizeSpec(template.spec)
    if (nameKey && specKey) {
      map.set(`${nameKey}||${specKey}`, template)
    }
  })
  return map
}

const templateIndex = buildIndex()

const PRODUCT_ALIASES = [
  {
    test: (name) => normalizeText(name).includes('寿司酱油'),
    targetName: '鱼生寿司',
  },
  {
    test: (name) => normalizeText(name) === '白灼汁',
    targetName: '百越牌白灼汁',
  },
]

export const findInspectionTemplate = (productName, productSpec) => {
  const normalizedName = normalizeText(productName)
  const normalizedSpec = normalizeSpec(productSpec)

  const direct = templateIndex.get(`${normalizedName}||${normalizedSpec}`)
  if (direct) return direct

  for (const alias of PRODUCT_ALIASES) {
    if (alias.test(productName)) {
      const aliasKey = `${normalizeText(alias.targetName)}||${normalizedSpec}`
      const aliasTemplate = templateIndex.get(aliasKey)
      if (aliasTemplate) return aliasTemplate
    }
  }

  for (const [key, template] of templateIndex.entries()) {
    if (key.startsWith(`${normalizedName}||`)) {
      return template
    }
  }

  return null
}

export const getInspectionTemplates = () => templatesData.templates
