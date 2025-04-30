export function HomePanel() {
  return (
    <div className="flex flex-col w-full h-full min-h-screen overflow-hidden">
      <iframe
        src="https://onboarding.ampedbio.com/"
        title="Amped Bio Onboarding"
        className="w-full h-full flex-grow"
        style={{ border: "none", height: "100%" }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      ></iframe>
    </div>
  );
}
