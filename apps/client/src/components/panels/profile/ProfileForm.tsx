import SlateEditor from "@/components/blocks/text/TextEditor/SlateEditor";
import type { UserProfile } from "../../../types/editor";
import { Input } from "@/components/ui/Input";

interface ProfileFormProps {
  profile: UserProfile;
  onUpdate: (field: string, value: string) => void;
}

export function ProfileForm({ profile, onUpdate }: ProfileFormProps) {
  return (
    <div className="space-y-6">
      <Input
        label="Name"
        value={profile.name}
        onChange={e => onUpdate("name", e.target.value)}
        placeholder="Enter your name"
      />

      {/* <Input
        label="Title"
        value={profile.title}
        onChange={(e) => onUpdate('title', e.target.value)}
        placeholder="Your professional title or tagline"
      /> */}

      <SlateEditor
        // label="Bio"
        initialValue={profile.bio}
        onSave={e => onUpdate("bio", e)}
        // placeholder="Tell your story..."
        // rows={4}
      />
    </div>
  );
}
