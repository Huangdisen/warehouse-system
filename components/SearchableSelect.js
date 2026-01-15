'use client'
import { useState, useRef, useEffect } from 'react'

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = '请选择',
  displayKey = 'label',
  valueKey = 'value',
  renderOption,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 获取当前选中的选项
  const selectedOption = options.find(opt => opt[valueKey] === value)

  // 过滤选项
  const filteredOptions = options.filter(opt => {
    if (!search) return true
    const label = typeof displayKey === 'function' ? displayKey(opt) : opt[displayKey]
    return label?.toLowerCase().includes(search.toLowerCase())
  })

  const handleSelect = (opt) => {
    onChange(opt[valueKey])
    setIsOpen(false)
    setSearch('')
  }

  const handleInputClick = () => {
    setIsOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const getDisplayText = (opt) => {
    if (typeof displayKey === 'function') return displayKey(opt)
    return opt[displayKey]
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* 显示框 */}
      <div
        onClick={handleInputClick}
        className="select-field cursor-pointer flex items-center justify-between"
      >
        <span className={selectedOption ? 'text-slate-900' : 'text-slate-400'}>
          {selectedOption ? getDisplayText(selectedOption) : placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* 下拉面板 */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
          {/* 搜索框 */}
          <div className="p-2 border-b border-slate-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="输入搜索..."
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* 选项列表 */}
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-500 text-center">
                无匹配结果
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt[valueKey]}
                  onClick={() => handleSelect(opt)}
                  className={`px-4 py-2.5 cursor-pointer transition-colors ${
                    opt[valueKey] === value
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {renderOption ? renderOption(opt) : (
                    <span className="text-sm">{getDisplayText(opt)}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
