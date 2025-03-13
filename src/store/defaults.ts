import type { EditorState, UserProfile } from '../types/editor';
import { AuthUser } from '@/types/auth';
import AmplifySVG from '../assets/AMPLIFY_FULL_K.svg'

const defaultProfile: UserProfile = {
    name: 'Amplify Digital',
    onelink: 'Amped-Bio',
    email: 'donotreply@amplifydigital.ai',
    bio: 'Empowering individuals and communities, enabling seamless transactions without intermediaries',
    photoCmp: AmplifySVG,
};

const initialState: EditorState = {
    profile: defaultProfile,
    blocks: [
        {
            id: '1',
            type: 'link',
            platform: 'twitter',
            url: 'https://x.com/amped_bio',
            label: 'Follow on X',
        },
        {
            id: '2',
            type: 'link',
            platform: 'github',
            url: 'https://github.com/amplifydigital-web3',
            label: 'Check out our Github',
        },
        {
            id: '3',
            type: 'link',
            platform: 'telegram',
            url: 'https://t.me/npayme_network',
            label: 'Connect on telegram',
        },
    ],
    theme: {
        id: 0,
        name: 'base',
        share_level: 'private',
        share_config: {},
        config: {
            buttonStyle: 1,
            containerStyle: 9,
            background: {
                label: 'Clean Lines',
                type: 'image',
                value: 'https://images.unsplash.com/photo-1557683311-eac922347aa1'
            },
            buttonColor: '#3b82f6',
            containerColor: '#ffffff',
            fontFamily: 'Inter',
            fontSize: '16px',
            fontColor: '#000000',
            transparency: 100,
            buttonEffect: 1,
            particlesEffect: 2,
            heroEffect: 0,
        }

    },
    activePanel: 'profile',
    gallery: [],
    marketplaceView: 'grid',
    marketplaceFilter: '',
    marketplaceSort: 'popular',
    selectedPoolId: null,
};

const defaultbio = 'This is your default Bio! 🚀';

export default initialState;

export const defaultAuthUser: AuthUser = {
    email: 'donotreply@amplifydigital.ai',
    id: '',
    token: '',
    onelink: 'Amped-Bio',
}