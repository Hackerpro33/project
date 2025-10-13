import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'

import Layout from './Layout.jsx'
import { PAGES } from './pageRegistry'

function PagesContent() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<PAGES.Dashboard />} />
        {Object.entries(PAGES).map(([name, Component]) => (
          <Route key={name} path={`/${name}`} element={<Component />} />
        ))}
      </Routes>
    </Layout>
  )
}

export default function Pages() {
  return (
    <Router>
      <PagesContent />
    </Router>
  )
}
