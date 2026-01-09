import SlateEditor from "@/components/blocks/text/TextEditor/SlateEditor";
import type { UserProfile } from "../../../types/editor";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { RevoName } from "@/types/rns/name";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

interface ProfileFormProps {
  profile: UserProfile;
  onUpdate: (field: string, value: string) => void;
  revoNames: RevoName[] | null;
  isRevoNameFetching: boolean;
}

export const isRevoNameExpired = (expiryDateWithGrace: string): boolean => {
  const currentTime = Math.floor(Date.now() / 1000);
  const expiresTime = Number(expiryDateWithGrace);

  if (expiresTime < currentTime) return true;

  return false;
};

export function ProfileForm({
  profile,
  onUpdate,
  revoNames,
  isRevoNameFetching,
}: ProfileFormProps) {
  return (
    <div className="space-y-6">
      <Input
        label="Display Name"
        value={profile.name}
        onChange={e => onUpdate("name", e.target.value)}
        placeholder="Enter your name"
      />
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Revolution Name</h3>
        <p className="text-sm text-muted-foreground">Select your Revolution Name</p>
        <Select
          value={profile.revoName ?? "none"}
          onValueChange={value => onUpdate("revoName", value === "none" ? "" : value)}
          disabled={isRevoNameFetching}
          defaultValue={profile.revoName ?? "none"}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={isRevoNameFetching ? "Loading names..." : "None"} />
          </SelectTrigger>

          <SelectContent className="max-h-60">
            <SelectItem value="none" className="cursor-pointer">
              None
            </SelectItem>
            {profile.revoName && !revoNames?.some(n => n.name === profile.revoName) && (
              <SelectItem value={profile.revoName}>{profile.revoName}</SelectItem>
            )}

            {revoNames &&
              revoNames.length > 0 &&
              !isRevoNameFetching &&
              revoNames.map(name => (
                <SelectItem
                  key={name.name}
                  value={name.name}
                  disabled={isRevoNameExpired(name.expiryDateWithGrace)}
                  className="cursor-pointer data-[disabled]:cursor-not-allowed"
                >
                  <span>{name.name}</span>
                  {isRevoNameExpired(name.expiryDateWithGrace) && (
                    <Badge variant="secondary" className="mx-2">
                      Expired
                    </Badge>
                  )}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Link
          to={`?p=rns`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6366f1] hover:underline"
        >
          Manage names → RNS
        </Link>
      </div>

      {/* <Input
        label="Title"
        value={profile.title}
        onChange={(e) => onUpdate('title', e.target.value)}
        placeholder="Your professional title or tagline"
      /> */}

      <div>
        <Label htmlFor="bio" className="text-sm font-medium text-gray-700">
          Bio
        </Label>
        <SlateEditor
          // label="Bio"
          initialValue={profile.bio}
          onSave={e => onUpdate("bio", e)}
          // placeholder="Tell your story..."
          // rows={4}
        />
      </div>
    </div>
  );
}
