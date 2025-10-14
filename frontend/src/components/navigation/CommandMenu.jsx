import { useNavigate } from 'react-router-dom'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

export default function CommandMenu({ open, onOpenChange, items }) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const handleSelect = (url) => {
    onOpenChange(false)
    navigate(url)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      label={t('hotkeys.paletteLabel')}
      commandProps={{ id: 'command-menu' }}
    >
      <CommandInput placeholder={t('hotkeys.palettePlaceholder')} aria-label={t('hotkeys.paletteLabel')} />
      <CommandList>
        <CommandEmpty>{t('hotkeys.noResults')}</CommandEmpty>
        <CommandGroup heading={t('hotkeys.navigationGroup')}>
          {items.map((item) => (
            <CommandItem
              key={item.url}
              value={`${item.title} ${item.url}`}
              onSelect={() => handleSelect(item.url)}
            >
              <span>{item.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t('hotkeys.helpGroup')}>
          <CommandItem value="theme" disabled>
            <span>{t('hotkeys.theme')}</span>
            <CommandShortcut>{t('hotkeys.themeShortcut')}</CommandShortcut>
          </CommandItem>
          <CommandItem value="language" disabled>
            <span>{t('hotkeys.language')}</span>
            <CommandShortcut>{t('hotkeys.languageShortcut')}</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

CommandMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  onOpenChange: PropTypes.func.isRequired,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      title: PropTypes.string.isRequired,
      url: PropTypes.string.isRequired,
    })
  ).isRequired,
}
