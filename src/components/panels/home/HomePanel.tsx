export function HomePanel() {
  return (
    <div className="h-full w-full flex flex-col">
      <iframe
        src="https://onboarding.ampedbio.com/"
        title="Amped Bio Onboarding"
        className="w-full h-full flex-1"
        style={{ border: "none" }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      ></iframe>
    </div>
  );
}
