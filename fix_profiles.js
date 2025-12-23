// Script pour corriger les profils avec enabledSignals undefined
db.users.find({}).forEach(function(user) {
    let needsUpdate = false;
    
    if (user.configProfiles && user.configProfiles.length > 0) {
        user.configProfiles.forEach(function(profile, idx) {
            if (!profile.config || !profile.config.enabledSignals || typeof profile.config.enabledSignals !== 'object') {
                if (!profile.config) profile.config = {};
                profile.config.enabledSignals = { 
                    tkCross: true, 
                    kumoBreakout: true, 
                    kumoTwist: true, 
                    kijunBounce: true 
                };
                needsUpdate = true;
            }
        });
        
        if (needsUpdate) {
            db.users.updateOne(
                { _id: user._id }, 
                { $set: { configProfiles: user.configProfiles } }
            );
            print('Fixed user: ' + user.username);
        }
    }
});

print('Done!');
