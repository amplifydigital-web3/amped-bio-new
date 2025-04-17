import React, { useState } from "react";
import { Clock, Calendar, ArrowRight, ExternalLink } from "lucide-react";

// Simulated data for news
const mockNews = [
  {
    id: 1,
    title: "New customization features available",
    date: "April 15, 2025",
    category: "News",
    content:
      "We are excited to announce new customization features for your page. Now you can customize your buttons, effects and more!",
    image:
      "https://images.unsplash.com/photo-1661956602116-aa6865609028?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    url: "#",
  },
  {
    id: 2,
    title: "Integration with Web3 platforms expanded",
    date: "April 10, 2025",
    category: "Updates",
    content:
      "Our platform now supports even more integrations with Web3 services. Explore the new options in the blocks section.",
    image:
      "https://images.unsplash.com/photo-1639762681057-408e52192e55?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    url: "#",
  },
  {
    id: 3,
    title: "Create your first custom page today",
    date: "April 5, 2025",
    category: "Tutorial",
    content: "Learn how to create a stunning page in minutes with our step-by-step guide.",
    image:
      "https://images.unsplash.com/photo-1516382799247-87df95d790b7?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    url: "#",
  },
  {
    id: 4,
    title: "New theme collection available in the gallery",
    date: "April 1, 2025",
    category: "Design",
    content:
      "We've added over 20 new professional themes to our gallery. Find the perfect style for your digital presence!",
    image:
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    url: "#",
  },
];

// Component to display featured news
function FeaturedNews({ news }: { news: (typeof mockNews)[0] }) {
  return (
    <div className="relative rounded-2xl overflow-hidden bg-white shadow-md hover:shadow-xl transition-shadow">
      <div className="h-64 overflow-hidden">
        <img
          src={news.image}
          alt={news.title}
          className="w-full h-full object-cover transition-transform hover:scale-105 duration-500"
        />
        <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-medium">
          {news.category}
        </div>
      </div>
      <div className="p-6">
        <div className="flex items-center text-sm text-gray-500 mb-3">
          <Calendar className="w-4 h-4 mr-1" />
          <span>{news.date}</span>
        </div>
        <h2 className="text-xl font-semibold mb-3 text-gray-900">{news.title}</h2>
        <p className="text-gray-600 mb-4">{news.content}</p>
        <a
          href={news.url}
          className="inline-flex items-center text-blue-600 font-medium hover:text-blue-800"
        >
          Read more <ArrowRight className="w-4 h-4 ml-1" />
        </a>
      </div>
    </div>
  );
}

// Component to display news in the list
function NewsItem({ news }: { news: (typeof mockNews)[0] }) {
  return (
    <div className="flex gap-4 bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow">
      <div className="flex-shrink-0 w-24 h-24 overflow-hidden rounded-lg">
        <img src={news.image} alt={news.title} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center text-xs text-gray-500 mb-1">
          <Clock className="w-3 h-3 mr-1" />
          <span>{news.date}</span>
        </div>
        <h3 className="text-gray-900 font-medium mb-1 line-clamp-2">{news.title}</h3>
        <p className="text-gray-600 text-sm line-clamp-2">{news.content}</p>
        <a
          href={news.url}
          className="mt-2 inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
        >
          Details <ArrowRight className="w-3 h-3 ml-1" />
        </a>
      </div>
    </div>
  );
}

// List of categories to filter news
const categories = [
  { id: "all", name: "All" },
  { id: "News", name: "News" },
  { id: "Updates", name: "Updates" },
  { id: "Tutorial", name: "Tutorials" },
  { id: "Design", name: "Design" },
];

// Main HomePanel component
export function HomePanel() {
  const [activeCategory, setActiveCategory] = useState("all");

  // Filter news based on selected category
  const filteredNews =
    activeCategory === "all" ? mockNews : mockNews.filter(news => news.category === activeCategory);

  // Separate the first news as featured
  const [featuredNews, ...restNews] = filteredNews;

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">News and Updates</h2>
        <p className="text-gray-600">Stay on top of the latest news and platform updates</p>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {categories.map(category => (
          <button
            key={category.id}
            onClick={() => setActiveCategory(category.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeCategory === category.id
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      {/* Main content */}
      {filteredNews.length > 0 ? (
        <div className="space-y-8">
          {/* Featured news */}
          {featuredNews && <FeaturedNews news={featuredNews} />}

          {/* News list */}
          {restNews.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Other News</h3>
              <div className="grid gap-4">
                {restNews.map(news => (
                  <NewsItem key={news.id} news={news} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No news found in this category.</p>
        </div>
      )}

      {/* Footer */}
      <div className="pt-4 border-t border-gray-200 flex justify-between items-center">
        <p className="text-sm text-gray-500">Updated on April 17, 2025</p>
        <a
          href="#"
          className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          See all news <ExternalLink className="w-4 h-4 ml-1" />
        </a>
      </div>
    </div>
  );
}
