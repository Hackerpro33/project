import React from 'react'
import PropTypes from 'prop-types'
import { ThemeProvider as NextThemeProvider } from 'next-themes'

export function ThemeProvider({ children }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  )
}

ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
}
