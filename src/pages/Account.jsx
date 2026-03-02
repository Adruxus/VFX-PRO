import { Helmet } from 'react-helmet-async'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User, Mail, Key, Bell } from 'lucide-react'

export default function Account() {
    return (
        <>
            <Helmet><title>Account Settings - VJ Studio Pro</title></Helmet>
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-white">Account Settings</h1>
                <div className="grid gap-6 md:grid-cols-2">
                    <Card className="bg-slate-900/50 border-purple-500/20">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2"><User className="w-5 h-5" />Profile</CardTitle>
                            <CardDescription className="text-gray-400">Update your profile information</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-white">Name</Label>
                                <Input defaultValue="John Doe" className="bg-slate-800 border-purple-500/20 text-white" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-white">Email</Label>
                                <Input defaultValue="john@example.com" className="bg-slate-800 border-purple-500/20 text-white" />
                            </div>
                            <Button className="w-full bg-gradient-to-r from-purple-500 to-pink-500">Save Changes</Button>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-900/50 border-purple-500/20">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2"><Key className="w-5 h-5" />Security</CardTitle>
                            <CardDescription className="text-gray-400">Manage your password and security</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button variant="outline" className="w-full border-purple-500/20">Change Password</Button>
                            <Button variant="outline" className="w-full border-purple-500/20">Enable 2FA</Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    )
}