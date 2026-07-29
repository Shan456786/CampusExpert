import Navbar from "@/components/layout/Navbar";
import Hero from "@/components/home/Hero";
import SearchBar from "@/components/home/SearchBar";
import SuggestedQuestions from "@/components/home/SuggestedQuestions";
import Features from "@/components/home/Features";
import Footer from "@/components/layout/Footer";

export default function Home() {
  return (
    <>
      <Navbar />

      <main>
        <Hero />
        <SearchBar />
        <SuggestedQuestions />
        <Features />
      </main>

      <Footer />
    </>
  );
}