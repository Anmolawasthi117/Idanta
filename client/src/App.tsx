import { useState } from 'react'
import { Rocket, Server, Layout, Database } from 'lucide-react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-4xl w-full space-y-12">
        {/* Header Section */}
        <section className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-2xl mb-4 border border-blue-500/20">
            <Rocket className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Idanta Full-Stack
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            A production-grade foundation with FastAPI, React, Tailwind, and TanStack Query.
          </p>
        </section>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FeatureCard 
            icon={<Server className="w-6 h-6 text-emerald-400" />}
            title="FastAPI Backend"
            description="High-performance Python backend with Pydantic models and dependency injection."
          />
          <FeatureCard 
            icon={<Layout className="w-6 h-6 text-purple-400" />}
            title="React + Vite + TS"
            description="Modern frontend stack for speed, type safety, and developer experience."
          />
          <FeatureCard 
            icon={<Database className="w-6 h-6 text-orange-400" />}
            title="TanStack Query"
            description="Powerful asynchronous state management for seamless data fetching."
          />
          <FeatureCard 
            icon={<Rocket className="w-6 h-6 text-pink-400" />}
            title="Tailwind CSS"
            description="Utility-first styling for beautiful and responsive user interfaces."
          />
        </div>

        {/* Interactive Element */}
        <div className="flex flex-col items-center space-y-6 pt-8">
          <button 
            onClick={() => setCount((count) => count + 1)}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 transition-colors rounded-full font-medium shadow-lg shadow-blue-500/20 active:scale-95"
          >
            Counter: {count}
          </button>
          <p className="text-slate-500 text-sm">
            Everything is set up and ready for your production application.
          </p>
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl hover:border-slate-700 transition-colors group">
      <div className="flex items-center space-x-4 mb-4">
        <div className="p-2 bg-slate-800 rounded-lg group-hover:bg-slate-700 transition-colors">
          {icon}
        </div>
        <h3 className="text-xl font-semibold">{title}</h3>
      </div>
      <p className="text-slate-400 leading-relaxed">
        {description}
      </p>
    </div>
  )
}

export default App
