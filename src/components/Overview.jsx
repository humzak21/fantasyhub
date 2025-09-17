import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Trophy, BarChart3, Users, Target, LogOut, ArrowRight } from 'lucide-react'

export const Overview = () => {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const features = [
    {
      icon: Trophy,
      title: 'Power Rankings',
      description: 'Advanced algorithms to rank teams based on performance, strength of schedule, and quality metrics.',
      color: 'from-yellow-500 to-orange-500'
    },
    {
      icon: BarChart3,
      title: 'Analytics Dashboard',
      description: 'Comprehensive statistics and insights to track team performance over time.',
      color: 'from-blue-500 to-indigo-500'
    },
    {
      icon: Users,
      title: 'Team Management',
      description: 'Easily manage teams, owners, and league configuration.',
      color: 'from-green-500 to-emerald-500'
    },
    {
      icon: Target,
      title: 'Score Tracking',
      description: 'Track weekly scores and automatically update rankings and statistics.',
      color: 'from-purple-500 to-pink-500'
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center">
                <Trophy className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Fantasy Football</h1>
                <p className="text-sm text-muted-foreground">Power Rankings Dashboard</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">Welcome, {user?.name || user?.email}</span>
              <Button
                onClick={handleSignOut}
                variant="ghost"
                size="sm"
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mb-6">
            <Trophy className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            Fantasy Football Power Rankings
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Advanced analytics and power rankings for competitive fantasy football leagues. 
            Track performance, analyze trends, and gain insights into your league dynamics.
          </p>
          <Button
            onClick={() => navigate('/fantasy')}
            size="lg"
            className="gap-2"
          >
            Open Dashboard
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <Card key={index} className="group hover:shadow-lg transition-all duration-200">
                <CardHeader>
                  <div className={`w-12 h-12 bg-gradient-to-br ${feature.color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Stats Section */}
        <Card className="mb-16">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Why Use Power Rankings?</CardTitle>
            <CardDescription>
              Go beyond simple win-loss records with advanced analytics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
              <div>
                <div className="text-3xl font-bold text-primary mb-2">📊</div>
                <h3 className="font-semibold mb-2">Advanced Metrics</h3>
                <p className="text-muted-foreground text-sm">
                  Strength of schedule, quality wins, and point differential analysis
                </p>
              </div>
              <div>
                <div className="text-3xl font-bold text-primary mb-2">⚡</div>
                <h3 className="font-semibold mb-2">Real-time Updates</h3>
                <p className="text-muted-foreground text-sm">
                  Rankings update automatically as you enter weekly scores
                </p>
              </div>
              <div>
                <div className="text-3xl font-bold text-primary mb-2">🎯</div>
                <h3 className="font-semibold mb-2">Actionable Insights</h3>
                <p className="text-muted-foreground text-sm">
                  Identify trends and make informed decisions for your league
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold mb-4">Ready to Get Started?</h2>
              <p className="text-muted-foreground mb-6">
                Create your first season, add teams, and start tracking power rankings today.
              </p>
              <Button
                onClick={() => navigate('/fantasy')}
                size="lg"
                className="gap-2"
              >
                Launch Fantasy Dashboard
                <ArrowRight className="h-5 w-5" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}