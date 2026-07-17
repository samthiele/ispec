import Markdown from 'react-markdown'

export default function LlmMarkdown({ children }) {
  return (
    <div className="llm-markdown">
      <Markdown
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {linkChildren}
            </a>
          ),
          pre: ({ children }) => <pre className="llm-markdown-pre">{children}</pre>,
          code: ({ className, children }) => {
            const isBlock = className?.includes('language-')
            if (isBlock) {
              return <code className={className}>{children}</code>
            }
            return <code className="llm-markdown-inline-code">{children}</code>
          },
          p: ({ children }) => <p className="llm-markdown-p">{children}</p>,
          ul: ({ children }) => <ul className="llm-markdown-list">{children}</ul>,
          ol: ({ children }) => <ol className="llm-markdown-list">{children}</ol>,
          li: ({ children }) => <li className="llm-markdown-list-item">{children}</li>,
          h1: ({ children }) => <h4 className="llm-markdown-heading">{children}</h4>,
          h2: ({ children }) => <h4 className="llm-markdown-heading">{children}</h4>,
          h3: ({ children }) => <h5 className="llm-markdown-heading">{children}</h5>,
          h4: ({ children }) => <h5 className="llm-markdown-heading">{children}</h5>,
        }}
      >
        {children}
      </Markdown>
    </div>
  )
}
